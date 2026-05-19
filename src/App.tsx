import { useState, useEffect, useCallback } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignPersonalMessage,
  useSuiClient,
} from '@mysten/dapp-kit';
import {
  Loader2, RefreshCw, ChevronRight, Hash, Lock, Unlock,
  AlertCircle, CheckCircle2, Mail, MailOpen, X, ExternalLink, FileText
} from 'lucide-react';

import type { FormConfig, FormResponse, FormField } from './types';
import { walrusDownload, walrusDownloadJSON } from './lib/walrus';
import { createSessionKey, sealDecryptResponse } from './lib/seal';
import {
  fetchOwnerFormEvents,
  fetchAllOwnerCaps,
  fetchFormObject,
} from './lib/contract';
import { useAppStore } from './store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeVecU8(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return new TextDecoder().decode(new Uint8Array(val as number[]));
  if (val instanceof Uint8Array) return new TextDecoder().decode(val);
  return String(val ?? '');
}

function priorityToString(p: number): 'high' | 'medium' | 'low' | undefined {
  if (p === 3) return 'high';
  if (p === 2) return 'medium';
  if (p === 1) return 'low';
  return undefined;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

function isSealedValue(val: unknown): val is { __sealed: boolean; data: number[] } {
  return typeof val === 'object' && val !== null && '__sealed' in val &&
    (val as Record<string, unknown>).__sealed === true;
}

function tryParseContent(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return JSON.parse(text.trim());
  } catch { return null; }
}

function renderValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── Response Detail Modal ─────────────────────────────────────────────────────

interface ModalProps {
  response: FormResponse;
  form: FormConfig;
  onClose: () => void;
}

function ResponseModal({ response, form, onClose }: ModalProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [fetchedData, setFetchedData] = useState<Record<string, unknown> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [needsDecrypt, setNeedsDecrypt] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);

  // Load blob on mount
  useEffect(() => {
    if (!response.blobId) return;
    setFetching(true);
    setFetchError('');

    walrusDownload(response.blobId)
      .then(bytes => {
        setRawBytes(bytes);
        if (form.sealEncrypted) {
          setNeedsDecrypt(true);
          setFetching(false);
          return;
        }
        const parsed = tryParseContent(bytes);
        if (!parsed) {
          setFetchError('Cannot parse blob — may be encrypted.');
          setFetching(false);
          return;
        }
        const answers = (parsed.answers ?? parsed) as Record<string, unknown>;
        setFetchedData(answers);
        setFetching(false);
      })
      .catch(err => {
        setFetchError(err instanceof Error ? err.message : String(err));
        setFetching(false);
      });
  }, [response.blobId, form.sealEncrypted]);

  // Decrypt whole blob (sealEncrypted form)
  async function handleSealDecrypt() {
    if (!rawBytes || !account) return;
    if (!form.onChain?.objectId || !form.onChain?.capId) return;
    if (response.responseIndex == null) { setFetchError('Missing responseIndex.'); return; }

    setDecrypting(true);
    setFetchError('');
    try {
      const sessionKey = await createSessionKey(account.address, async ({ message }) => {
        const result = await signPersonalMessage({ message });
        return { signature: result.signature };
      });
      const decryptedBytes = await sealDecryptResponse(
        rawBytes, form.onChain.objectId, form.onChain.capId,
        response.responseIndex, sessionKey,
      );
      const parsed = tryParseContent(decryptedBytes);
      if (!parsed) { setFetchError('Decrypted but failed to parse JSON.'); return; }
      const answers = (parsed.answers ?? parsed) as Record<string, unknown>;
      setFetchedData(answers);
      setNeedsDecrypt(false);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecrypting(false);
    }
  }

  // Decrypt single sealed field
  async function handleDecryptField(fieldId: string) {
    if (!account || !form.onChain?.objectId || !form.onChain?.capId) return;
    if (response.responseIndex == null) return;

    setDecrypting(true);
    setFetchError('');
    try {
      const sessionKey = await createSessionKey(account.address, async ({ message }) => {
        const result = await signPersonalMessage({ message });
        return { signature: result.signature };
      });
      const sealedVal = fetchedData![fieldId] as { __sealed: boolean; data: number[] };
      const encryptedBytes = new Uint8Array(sealedVal.data);
      const decryptedBytes = await sealDecryptResponse(
        encryptedBytes, form.onChain.objectId, form.onChain.capId,
        response.responseIndex, sessionKey,
      );
      let text = new TextDecoder('utf-8').decode(decryptedBytes);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      setFetchedData(prev => ({ ...prev!, [fieldId]: parsed }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecrypting(false);
    }
  }

  const displayData = fetchedData ?? response.data ?? {};
  const fields: FormField[] = form.fields ?? [];

  function renderField(field: FormField, val: unknown) {
    const isSealed = isSealedValue(val);
    return (
      <div key={field.id} className="field-item">
        <div className="field-key">
          {field.label}
          {field.sealEncrypted && <span className="sealed-badge"><Lock size={9} /> Sealed</span>}
        </div>
        <div className="field-val">
          {isSealed ? (
            <div className="sealed-row">
              <span className="encrypted-hint">🔒 Encrypted — click to decrypt</span>
              <button className="btn-decrypt" onClick={() => handleDecryptField(field.id)} disabled={decrypting || !account}>
                {decrypting ? <><Loader2 size={11} className="spin" />Decrypting...</> : <><Unlock size={11} />Decrypt</>}
              </button>
            </div>
          ) : renderValue(val)}
        </div>
      </div>
    );
  }

  function renderAllFields() {
    if (fetching) return <div className="loading-row"><Loader2 size={14} className="spin" /> Loading data...</div>;

    if (fields.length > 0) {
      return fields.map(f => renderField(f, displayData[f.id]));
    }

    const keys = Object.keys(displayData);
    if (keys.length === 0) return <div className="muted">No submission data.</div>;
    return keys.map(key => renderField(
      { id: key, type: 'short_text', label: key, required: false },
      displayData[key]
    ));
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <Mail size={16} style={{ color: 'var(--green)' }} />
            <span className="modal-title">Response detail</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Submitted at */}
          <div className="modal-section-label">SUBMITTED AT</div>
          <div className="modal-info-row">
            <span>{new Date(response.submittedAt).toLocaleString()}</span>
            <span className="muted">({timeAgo(response.submittedAt)})</span>
          </div>

          {/* Blob ID */}
          {response.blobId && (
            <>
              <div className="modal-section-label">WALRUS BLOB ID</div>
              <div className="modal-info-row">
                <Hash size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <code className="mono-sm">{response.blobId}</code>
              </div>
            </>
          )}

          <div className="modal-divider" />

          {/* Content header */}
          <div className="modal-section-label" style={{ marginBottom: 10 }}>
            SUBMISSION CONTENT
            {form.sealEncrypted
              ? <span className="badge-seal">🔒 Seal</span>
              : <span className="badge-walrus">← Walrus</span>}
            {(fetching || decrypting) && <Loader2 size={12} className="spin" style={{ marginLeft: 8 }} />}
          </div>

          {fetchError && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <AlertCircle size={13} />{fetchError}
            </div>
          )}

          {/* Seal decrypt button */}
          {needsDecrypt && !fetchedData && (
            <div className="seal-decrypt-box">
              <div className="seal-decrypt-hint">
                <Lock size={14} /> Data is encrypted with Seal. Sign with your wallet to decrypt.
              </div>
              {!account
                ? <div className="alert alert-warn"><AlertCircle size={13} />Connect wallet first.</div>
                : <button className="btn-seal" onClick={handleSealDecrypt} disabled={decrypting}>
                    {decrypting
                      ? <><Loader2 size={13} className="spin" />Decrypting...</>
                      : <><Unlock size={13} />Decrypt with Seal</>}
                  </button>
              }
            </div>
          )}

          {/* Fields */}
          {(!needsDecrypt || fetchedData) && (
            <div className="fields-list">{renderAllFields()}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { forms, responses, setForms, setResponses } = useAppStore();

  const [loadingForms, setLoadingForms] = useState(false);
  const [selectedForm, setSelectedForm] = useState<FormConfig | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [error, setError] = useState('');

  const myForms = forms;
  const formResponses = selectedForm
    ? responses.filter(r => r.formId === selectedForm.id)
    : [];

  // Load forms from chain
  const loadForms = useCallback(async () => {
    if (!account) return;
    setLoadingForms(true);
    setError('');
    try {
      const events = await fetchOwnerFormEvents(suiClient as any, ''); // bỏ filter owner
      const caps = await fetchAllOwnerCaps(suiClient as any, account.address);

      const loaded: FormConfig[] = [];
      for (const ev of events) {
        const onChain = await fetchFormObject(suiClient as any, ev.formObjectId);
        if (!onChain) continue;

        let configPayload: Partial<FormConfig> = {};
        try {
          configPayload = await walrusDownloadJSON<Partial<FormConfig>>(ev.configBlobId);
        } catch { /* ignore */ }

        loaded.push({
          id: ev.formObjectId,
          title: onChain.title,
          description: onChain.description,
          fields: configPayload.fields ?? [],
          sealEncrypted: onChain.seal_encrypted,
          createdAt: new Date(Number(onChain.created_at)).toISOString(),
          published: onChain.published,
          responseCount: Number(onChain.response_count),
          coverBlobId: configPayload.coverBlobId,
          onChain: {
            objectId: ev.formObjectId,
            capId: caps[ev.formObjectId] ?? '',
            configBlobId: ev.configBlobId,
          },
        });
      }
      setForms(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingForms(false);
    }
  }, [account, suiClient, setForms]);

  // Auto-load when wallet connects
  useEffect(() => {
    if (account) loadForms();
  }, [account?.address]);

  // Load responses for selected form
  const loadResponses = useCallback(async (form: FormConfig) => {
    if (!form.onChain?.objectId) return;
    setLoadingResponses(true);
    setError('');
    try {
      const formObj = await suiClient.getObject({
        id: form.onChain.objectId,
        options: { showContent: true },
      });

      if (!formObj.data?.content || formObj.data.content.dataType !== 'moveObject') return;
      const formFields = (formObj.data.content as { fields: Record<string, unknown> }).fields;
      const responsesTable = formFields.responses as { fields?: { id?: { id?: string } } } | null;
      const tableId = responsesTable?.fields?.id?.id;
      if (!tableId) { setResponses(form.id, []); return; }

      const dynamicFields = await suiClient.getDynamicFields({ parentId: tableId });
      const loaded: FormResponse[] = [];

      for (const field of dynamicFields.data) {
        try {
          const obj = await suiClient.getDynamicFieldObject({ parentId: tableId, name: field.name });
          if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;
          const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
          const valueFields = (fields.value as { fields?: Record<string, unknown> })?.fields ?? fields;

          const idx = Number(valueFields.index ?? valueFields.key ?? 0);
          const blobId = decodeVecU8(valueFields.blob_id ?? valueFields.value ?? '');
          const submitter = decodeVecU8(valueFields.submitter ?? '');
          const submittedAt = (valueFields.submitted_at ?? Date.now().toString()) as string;
          const priority = priorityToString(Number(valueFields.priority ?? 0));

          loaded.push({
            id: `${form.id}-${idx}`,
            formId: form.id,
            walletAddress: submitter,
            submittedAt: new Date(Number(submittedAt)).toISOString(),
            data: {},
            blobId: blobId || undefined,
            responseIndex: idx,
            priority,
          });
        } catch { /* skip */ }
      }

      setResponses(form.id, loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingResponses(false);
    }
  }, [suiClient, setResponses]);

  function handleSelectForm(form: FormConfig) {
    setSelectedForm(form);
    setSelectedResponse(null);
    loadResponses(form);
  }

  const priorityClass: Record<string, string> = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };

  return (
    <div className="app-root">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon"><img src="https://aggregator.walrus-mainnet.walrus.space/v1/blobs/YzsRios57h2st5Tu7OQUJmsT4Lr9duddamSS8q7Lo6c" style={{width:36,height:36,borderRadius:8,objectFit:'cover'}} /></span>
            <span className="logo-text">Walrus <span className="logo-accent">+ Seal</span> Tester</span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="main">
        {!account ? (
          <div className="empty-state">
            <Lock size={32} style={{ color: 'var(--text-3)' }} />
            <p>Connect your wallet to load forms</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {/* Left: Forms list */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Forms</span>
                <button className="btn-icon" onClick={loadForms} disabled={loadingForms} title="Refresh">
                  <RefreshCw size={14} className={loadingForms ? 'spin' : ''} />
                </button>
              </div>

              {loadingForms && (
                <div className="loading-row"><Loader2 size={14} className="spin" />Loading forms...</div>
              )}

              {!loadingForms && myForms.length === 0 && (
                <div className="empty-state-sm">No forms found for this wallet.</div>
              )}

              <div className="form-list">
                {myForms.map(form => (
                  <button
                    key={form.id}
                    className={`form-item ${selectedForm?.id === form.id ? 'active' : ''}`}
                    onClick={() => handleSelectForm(form)}
                  >
                    <div className="form-item-icon"><FileText size={14} /></div>
                    <div className="form-item-content">
                      <div className="form-item-title">{form.title}</div>
                      <div className="form-item-meta">
                        <span>{form.responseCount} response{form.responseCount !== 1 ? 's' : ''}</span>
                        {form.sealEncrypted && <span className="badge-seal-sm"><Lock size={9} />Seal</span>}
                        {form.published ? <span className="dot-green" /> : <span className="dot-gray" />}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Responses list */}
            <div className="panel">
              {!selectedForm ? (
                <div className="empty-state-sm" style={{ paddingTop: 40 }}>
                  ← Select a form to view responses
                </div>
              ) : (
                <>
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">{selectedForm.title}</div>
                      <div className="panel-subtitle">{formResponses.length} response{formResponses.length !== 1 ? 's' : ''}</div>
                    </div>
                    <button className="btn-icon" onClick={() => loadResponses(selectedForm)} disabled={loadingResponses}>
                      <RefreshCw size={14} className={loadingResponses ? 'spin' : ''} />
                    </button>
                  </div>

                  {loadingResponses && (
                    <div className="loading-row"><Loader2 size={14} className="spin" />Loading responses...</div>
                  )}

                  {!loadingResponses && formResponses.length === 0 && (
                    <div className="empty-state-sm">No responses yet.</div>
                  )}

                  <div className="response-list">
                    {formResponses.map(r => (
                      <button
                        key={r.id}
                        className="response-item"
                        onClick={() => setSelectedResponse(r)}
                      >
                        <MailOpen size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        <div className="response-item-content">
                          <div className="response-wallet mono-sm">
                            {r.walletAddress ? `${r.walletAddress.slice(0, 6)}...${r.walletAddress.slice(-4)}` : '—'}
                          </div>
                          <div className="response-meta">
                            <span className="muted">{timeAgo(r.submittedAt)}</span>
                            {r.priority && (
                              <span className={`badge ${priorityClass[r.priority]}`}>{r.priority}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            <AlertCircle size={14} />{error}
          </div>
        )}
      </main>

      {/* Modal */}
      {selectedResponse && selectedForm && (
        <ResponseModal
          response={selectedResponse}
          form={selectedForm}
          onClose={() => setSelectedResponse(null)}
        />
      )}
    </div>
  );
}
