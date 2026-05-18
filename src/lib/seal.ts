import { SealClient, SessionKey } from '@mysten/seal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';
import { PACKAGE_ID, SEAL_THRESHOLD } from './constants';

// ── Client setup ──────────────────────────────────────────────────────────────
const suiClient = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
});

const sealClient = new SealClient({
  suiClient,
  serverConfigs: [
    { objectId: '0xe0eb52eba9261b96e895bbb4deca10dcd64fbc626a1133017adcd5131353fd10', weight: 1 },
    { objectId: '0x145540d931f182fef76467dd8074c9839aea126852d90d18e1556fcbbd1208b6', weight: 1 },
  ],
  verifyKeyServers: true,
});

// ── ID helpers ────────────────────────────────────────────────────────────────

export function buildSealId(formObjectId: string, responseIndex: number): Uint8Array {
  const raw = formObjectId.replace('0x', '').padStart(64, '0');
  const formIdBytes = fromHex(raw);

  const indexBytes = new Uint8Array(8);
  new DataView(indexBytes.buffer).setBigUint64(0, BigInt(responseIndex), true);

  return new Uint8Array([...formIdBytes, ...indexBytes]);
}

export function buildSealIdHex(formObjectId: string, responseIndex: number): string {
  return toHex(buildSealId(formObjectId, responseIndex));
}

// ── Session Key ───────────────────────────────────────────────────────────────

export async function createSessionKey(
  walletAddress: string,
  signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>,
  ttlMin = 10,
) {
  const sessionKey = await SessionKey.create({
    address: walletAddress,
    packageId: PACKAGE_ID,
    ttlMin,
    suiClient,
  });

  const msgBytes = sessionKey.getPersonalMessage();
  const { signature } = await signPersonalMessage({ message: msgBytes });
  await sessionKey.setPersonalMessageSignature(signature);

  return sessionKey;
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

export async function sealEncryptResponse(
  formObjectId: string,
  responseIndex: number,
  data: Uint8Array,
): Promise<{ encryptedBytes: Uint8Array; backupKey: Uint8Array }> {
  const id = buildSealIdHex(formObjectId, responseIndex);

  const { encryptedObject, key: backupKey } = await sealClient.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: PACKAGE_ID,
    id,
    data,
  });

  return {
    encryptedBytes: encryptedObject,
    backupKey,
  };
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

export async function sealDecryptResponse(
  encryptedBytes: Uint8Array,
  formObjectId: string,
  capObjectId: string,
  responseIndex: number,
  sessionKey: Awaited<ReturnType<typeof createSessionKey>>,
): Promise<Uint8Array> {
  // FIX: truyền walletAddress vào để set sender đúng trong transaction
  // Seal server kiểm tra signer của tx phải là owner của capObjectId
  const walletAddress = sessionKey.getAddress();
  const txBytes = await buildSealApproveTx(formObjectId, capObjectId, responseIndex, walletAddress);

  return await sealClient.decrypt({
    data: encryptedBytes,
    sessionKey,
    txBytes,
  });
}

// ── PTB builders ──────────────────────────────────────────────────────────────

async function buildSealApproveTx(
  formObjectId: string,
  capObjectId: string,
  responseIndex: number,
  senderAddress: string,   // ← FIX: cần set sender để Seal server verify đúng
): Promise<Uint8Array> {
  const id = buildSealId(formObjectId, responseIndex);
  const tx = new Transaction();

  // FIX: set sender = địa chỉ ví của admin (owner của capObjectId)
  // Khi không set, gRPC client dùng 0x000...000 làm dummy sender
  // → Seal server từ chối vì signer không phải owner của cap object
  tx.setSender(senderAddress);

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain_seal::seal_approve`,
    arguments: [
      tx.pure.vector('u8', Array.from(id)),
      tx.object(capObjectId),
      tx.object(formObjectId),
    ],
  });

  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}
