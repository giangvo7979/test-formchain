import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, REGISTRY_ID, CLOCK_ID } from './constants';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateFormParams {
  configBlobId: string;
  title: string;
  description: string;
  sealEncrypted: boolean;
  sealPolicyId?: string;
}

export interface OnChainResponseRecord {
  index: number;
  blob_id: string;
  submitter: string;
  submitted_at: string;
  priority: number;
  note: string;
}

export interface OnChainFormFields {
  id: { id: string };
  config_blob_id: string;
  title: string;
  description: string;
  owner: string;
  seal_encrypted: boolean;
  seal_policy_id: { fields: { vec: string[] } } | null;
  published: boolean;
  paused: boolean;
  created_at: string;
  updated_at: string;
  response_count: string;
  responses: {
    type: string;
    fields: {
      id: { id: string };
      size: string;
    };
  };
}

// ─── Transaction Builders ──────────────────────────────────────────────────────

/**
 * Build tx: Tạo form mới (draft).
 * Frontend upload config lên Walrus trước → lấy configBlobId → gọi hàm này.
 */
export function buildCreateFormTx(params: CreateFormParams): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::create_form`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.vector('u8', enc.encode(params.configBlobId)),
      tx.pure.vector('u8', enc.encode(params.title.slice(0, 120))),
      tx.pure.vector('u8', enc.encode(params.description.slice(0, 500))),
      tx.pure.bool(params.sealEncrypted),
      tx.pure.vector('u8', enc.encode(params.sealPolicyId ?? '')),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build tx: Publish form (bật nhận response).
 */
export function buildPublishFormTx(capId: string, formObjectId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::publish_form`,
    arguments: [
      tx.object(capId),
      tx.object(formObjectId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

export function buildSubmitResponseTx(
  formObjectId: string,
  blobId: string
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::submit_response`,
    arguments: [
      tx.object(formObjectId),
      tx.object(REGISTRY_ID),
      tx.pure.vector('u8', enc.encode(blobId)),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

export function buildAnnotateResponseTx(
  capId: string,
  formObjectId: string,
  responseIndex: number,
  priority: 0 | 1 | 2 | 3,
  note: string
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::annotate_response`,
    arguments: [
      tx.object(capId),
      tx.object(formObjectId),
      tx.pure.u64(responseIndex),
      tx.pure.u8(priority),
      tx.pure.vector('u8', enc.encode(note.slice(0, 1000))),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

export function buildSetPausedTx(
  capId: string,
  formObjectId: string,
  paused: boolean
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::set_paused`,
    arguments: [
      tx.object(capId),
      tx.object(formObjectId),
      tx.pure.bool(paused),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

export function buildUpdateConfigTx(
  capId: string,
  formObjectId: string,
  newConfigBlobId: string,
  newTitle: string,
  newDescription: string
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::update_config`,
    arguments: [
      tx.object(capId),
      tx.object(formObjectId),
      tx.pure.vector('u8', enc.encode(newConfigBlobId)),
      tx.pure.vector('u8', enc.encode(newTitle.slice(0, 120))),
      tx.pure.vector('u8', enc.encode(newDescription.slice(0, 500))),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

export function buildDeleteFormTx(
  capId: string,
  formObjectId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::formchain::delete_form`,
    arguments: [
      tx.object(capId),
      tx.object(formObjectId),
      tx.object(REGISTRY_ID),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

// Decode a Move vector<u8> field that JSON-RPC may return as number[] or Uint8Array
function decodeVecU8(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return new TextDecoder().decode(new Uint8Array(val as number[]));
  if (val instanceof Uint8Array) return new TextDecoder().decode(val);
  return String(val ?? '');
}

export async function fetchFormObject(
  suiClient: any,
  formObjectId: string
): Promise<OnChainFormFields | null> {
  try {
    const result = await suiClient.getObject({
      id: formObjectId,
      options: { showContent: true, showType: true },
    });

    if (!result.data?.content || result.data.content.dataType !== 'moveObject') return null;
    const raw = (result.data.content as { fields: Record<string, unknown> }).fields;

    // Decode vector<u8> fields — JSON-RPC returns them as number[] byte arrays
    const decoded: Record<string, unknown> = { ...raw };
    for (const key of ['config_blob_id', 'title', 'description']) {
      if (key in decoded && (Array.isArray(decoded[key]) || decoded[key] instanceof Uint8Array)) {
        decoded[key] = decodeVecU8(decoded[key]);
      }
    }
    console.log('[fetchFormObject] decoded:', decoded);
    return decoded as unknown as OnChainFormFields;
  } catch (e) {
    console.error('[fetchFormObject] error:', e);
    return null;
  }
}

export async function fetchOwnerFormEvents(
  suiClient: any,
  ownerAddress: string
): Promise<Array<{ formObjectId: string; configBlobId: string; sealEncrypted: boolean; timestamp: string }>> {
  try {
    if (typeof suiClient.queryEvents !== 'function') {
      console.warn('queryEvents not available on this client.');
      return [];
    }

    const events = await suiClient.queryEvents({
      query: { MoveEventType: `${PACKAGE_ID}::formchain::FormCreated` },
      limit: 500,
    });

    return (events.data ?? [])
      .map((e: { parsedJson: unknown }) => {
        const json = e.parsedJson as {
          form_id: string;
          config_blob_id: string;
          seal_encrypted: boolean;
          timestamp: string;
        };
        return {
          formObjectId: json.form_id,
          configBlobId: json.config_blob_id,
          sealEncrypted: json.seal_encrypted,
          timestamp: json.timestamp,
        };
      });
  } catch {
    return [];
  }
}

export async function fetchOwnerCap(
  suiClient: any,
  ownerAddress: string,
  formObjectId: string
): Promise<string | null> {
  try {
    const capType = `${PACKAGE_ID}::formchain::FormOwnerCap`;
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: capType },
      options: { showContent: true, showType: true },
    });

    for (const obj of result.data ?? []) {
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;
      const rawFields = (obj.data.content as { fields: Record<string, unknown> }).fields;
      let formId = rawFields?.form_id;
      if (Array.isArray(formId) || formId instanceof Uint8Array) {
        formId = new TextDecoder().decode(new Uint8Array(formId as number[]));
      }
      if (formId === formObjectId) {
        return obj.data.objectId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchAllOwnerCaps(
  suiClient: any,
  ownerAddress: string
): Promise<Record<string, string>> {
  try {
    const capType = `${PACKAGE_ID}::formchain::FormOwnerCap`;
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: capType },
      options: { showContent: true, showType: true },
    });

    console.log('[fetchAllOwnerCaps] raw result:', JSON.stringify(result?.data?.slice(0,2)));

    const mapping: Record<string, string> = {};
    for (const obj of result.data ?? []) {
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;
      const rawFields = (obj.data.content as { fields: Record<string, unknown> }).fields;
      // form_id is vector<u8> — may come as number array
      let formId = rawFields?.form_id;
      if (Array.isArray(formId) || formId instanceof Uint8Array) {
        formId = new TextDecoder().decode(new Uint8Array(formId as number[]));
      }
      if (typeof formId === 'string' && formId) {
        console.log('[fetchAllOwnerCaps] cap found — formId:', formId, 'capId:', obj.data.objectId);
        mapping[formId] = obj.data.objectId;
      }
    }
    console.log('[fetchAllOwnerCaps] mapping:', mapping);
    return mapping;
  } catch (e) {
    console.error('[fetchAllOwnerCaps] error:', e);
    return {};
  }
}

export function priorityToString(p: number): 'high' | 'medium' | 'low' | 'none' {
  if (p === 3) return 'high';
  if (p === 2) return 'medium';
  if (p === 1) return 'low';
  return 'none';
}

export function priorityToNumber(p?: 'high' | 'medium' | 'low'): 0 | 1 | 2 | 3 {
  if (p === 'high') return 3;
  if (p === 'medium') return 2;
  if (p === 'low') return 1;
  return 0;
}

export function parseCreateFormResult(effects: {
  created?: Array<{ reference: { objectId: string }; owner: string | { AddressOwner: string } | { Shared: unknown } }>;
}): { formObjectId: string; capId: string } | null {
  if (!effects.created) return null;

  let formObjectId = '';
  let capId = '';

  for (const obj of effects.created) {
    const isShared = typeof obj.owner === 'object' && 'Shared' in obj.owner;
    const isOwned = typeof obj.owner === 'object' && 'AddressOwner' in obj.owner;

    if (isShared) formObjectId = obj.reference.objectId;
    if (isOwned) capId = obj.reference.objectId;
  }

  if (!formObjectId || !capId) return null;
  return { formObjectId, capId };
}
// ─── Check if wallet already submitted ────────────────────────────────────────

export interface WalletSubmission {
  blobId: string;
  submittedAt: string; // ISO string
  responseIndex: number;
}

/**
 * Kiểm tra on-chain ví `walletAddress` đã gửi form `formObjectId` chưa.
 * Trả về thông tin lần gửi nếu có, null nếu chưa.
 */
export async function checkWalletSubmitted(
  suiClient: any,
  formObjectId: string,
  walletAddress: string,
): Promise<WalletSubmission | null> {
  try {
    // 1. Lấy Table ID của responses từ form object
    const formObj = await suiClient.getObject({
      id: formObjectId,
      options: { showContent: true },
    });

    if (!formObj.data?.content || formObj.data.content.dataType !== 'moveObject') return null;
    const formFields = (formObj.data.content as { fields: Record<string, unknown> }).fields;

    const responsesTable = formFields.responses as {
      fields?: { id?: { id?: string } };
    } | null;
    const tableId = responsesTable?.fields?.id?.id;
    if (!tableId) return null;

    // 2. Duyệt dynamic fields của Table, tìm entry có submitter trùng ví
    let cursor: string | null | undefined = undefined;
    while (true) {
      const page: { data: Array<{ name: unknown }>; hasNextPage: boolean; nextCursor?: string | null } =
        await suiClient.getDynamicFields({
        parentId: tableId,
        cursor,
        limit: 50,
      });

      for (const field of page.data) {
        try {
          const obj = await suiClient.getDynamicFieldObject({
            parentId: tableId,
            name: field.name,
          });

          if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;
          const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
          const valueFields = (fields.value as { fields?: Record<string, unknown> })?.fields ?? fields;

          const submitter = decodeVecU8(valueFields.submitter ?? '');
          if (submitter.toLowerCase() !== walletAddress.toLowerCase()) continue;

          // Tìm thấy!
          const blobId = decodeVecU8(valueFields.blob_id ?? valueFields.value ?? '');
          const submittedAt = (valueFields.submitted_at ?? valueFields.timestamp ?? Date.now().toString()) as string;
          const idx = Number(valueFields.index ?? valueFields.key ?? 0);

          return {
            blobId,
            submittedAt: new Date(Number(submittedAt)).toISOString(),
            responseIndex: idx,
          };
        } catch {
          // skip bad entry
        }
      }

      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
    }

    return null; // chưa gửi
  } catch (e) {
    console.error('[checkWalletSubmitted] error:', e);
    return null;
  }
}