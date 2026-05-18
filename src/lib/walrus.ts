import { walrus, WalrusFile } from '@mysten/walrus';
import type { Signer } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { WALRUS_AGGREGATOR } from './constants';

export interface WalrusUploadResult {
  blobId: string;
  size: number;
}

export interface WalrusUploadOptions {
  epochs?: number;
  deletable?: boolean;
}

type WalrusClient = ReturnType<typeof createWalrusClient>;
let _walrusClient: WalrusClient | null = null;

export function createWalrusClient() {
  return new SuiGrpcClient({
    baseUrl: 'https://fullnode.mainnet.sui.io:443',
    network: 'mainnet',
  }).$extend(
    walrus({
      storageNodeClientOptions: {
        timeout: 30000,
      },
    })
  );
}

function getWalrusClient(): WalrusClient {
  if (!_walrusClient) {
    _walrusClient = createWalrusClient();
  }
  return _walrusClient;
}

export function resetWalrusClient(): void {
  _walrusClient = null;
}

export async function walrusUpload(
  signer: Signer,
  data: Uint8Array,
  opts: WalrusUploadOptions = {},
): Promise<WalrusUploadResult> {
  const { epochs = 5, deletable = false } = opts;
  const client = getWalrusClient();

  try {
    const { blobId } = await client.walrus.writeBlob({
      blob: data,
      deletable,
      epochs,
      signer,
    });

    return { blobId, size: data.byteLength };
  } catch (err) {
    throw new Error(`Walrus upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Download blob từ Walrus SDK — tự nhận dạng quilt (writeFilesFlow) hay raw blob (writeBlob).
 *
 * - writeFilesFlow lưu dưới dạng quilt → dùng getBlob + blob.files()[0].bytes()
 * - writeBlob lưu raw → dùng readBlob
 * - SDK đọc trực tiếp từ storage nodes (không qua HTTP aggregator, không bị CORS)
 */
export async function walrusDownload(blobId: string): Promise<Uint8Array> {
  if (!blobId) throw new Error('walrusDownload: blobId is empty');

  const client = getWalrusClient();

  try {
    // getBlob + files() đọc được cả quilt (writeFilesFlow) lẫn raw blob
    const blob = await client.walrus.getBlob({ blobId });

    // Thử đọc như quilt trước
    try {
      const files = await blob.files();
      if (files && files.length > 0) {
        return await files[0].bytes();
      }
    } catch {
      // Không phải quilt → tiếp tục
    }

    // Đọc như raw blob
    return await client.walrus.readBlob({ blobId });

  } catch (err) {
    throw new Error(
      `walrusDownload failed for blobId "${blobId}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function walrusUploadJSON<T>(
  signer: Signer,
  data: T,
  opts?: WalrusUploadOptions,
): Promise<WalrusUploadResult> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return walrusUpload(signer, bytes, opts);
}

export async function walrusDownloadJSON<T>(blobId: string): Promise<T> {
  const bytes = await walrusDownload(blobId);

  try {
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.trim().replace(/\0+$/, '');
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `walrusDownloadJSON: failed to parse JSON from blobId "${blobId}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function walrusUploadFile(
  signer: Signer,
  file: File,
  opts?: WalrusUploadOptions,
): Promise<WalrusUploadResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return walrusUpload(signer, bytes, { epochs: 10, ...opts });
}

export function walrusBlobUrl(blobId: string): string {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`;
}
