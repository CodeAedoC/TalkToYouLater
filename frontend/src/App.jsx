import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = import.meta.env.VITE_API_URL;
const WS  = import.meta.env.VITE_WS_URL;

/* ─── Helpers ────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isImage(name = '') { return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name); }
function isVideo(name = '') { return /\.(mp4|webm|ogg|mov)$/i.test(name); }

/* Derive a short display name from chat + myId */
function chatLabel(chat, myId) {
  const others = (chat.participants || []).filter(p => p !== myId);
  if (others.length > 0) {
    const id = others[0];
    return id.slice(-8).toUpperCase();
  }
  return (chat.id || '').slice(-8).toUpperCase();
}

/* Two-letter avatar initials from the label */
function avatarLetters(label = '') {
  const parts = label.replace(/[^A-Z0-9]/gi, ' ').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/* Deterministic "online" status based on id hash */
function fakeStatus(id = '') {
  const n = id.charCodeAt(id.length - 1) % 3;
  return ['online', 'offline', 'busy'][n];
}

/* ─── Toast ──────────────────────────────────────────────────── */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}
function Toasts({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

/* ─── Status tick ────────────────────────────────────────────── */
function StatusTick({ status }) {
  if (!status) return null;
  if (status === 'sent')      return <span className="msg-status sent"     title="Sent">✓</span>;
  if (status === 'delivered') return <span className="msg-status delivered" title="Delivered">✓✓</span>;
  if (status === 'read')      return <span className="msg-status read"      title="Read">✓✓</span>;
  return null;
}

/* ─── Media renderer ─────────────────────────────────────────── */
function MediaBlock({ media }) {
  if (!media) return null;
  const url = `${API}${media.url}`;
  if (isImage(media.fileName)) {
    return <img className="media-img" src={url} alt={media.fileName} onClick={() => window.open(url, '_blank')} />;
  }
  if (isVideo(media.fileName)) {
    return (
      <video controls style={{ maxWidth: 240, borderRadius: 3, marginTop: 6, display: 'block', border: '1px solid rgba(0,229,255,0.2)' }}>
        <source src={url} />
      </video>
    );
  }
  return (
    <a className="media-file-link" href={url} target="_blank" rel="noreferrer" download={media.fileName}>
      <span className="media-icon">📎</span>
      <span className="media-meta">
        <span className="media-name">{media.fileName}</span>
        <span className="media-size">{fmtFileSize(media.fileSize)}</span>
      </span>
    </a>
  );
}

/* ─── Create Chat Modal ──────────────────────────────────────── */
function CreateChatModal({ myId, onClose, onCreated, toast }) {
  const [participantId, setParticipantId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = participantId.trim();
    if (!trimmed) return toast('Enter a participant ID', 'error');
    if (trimmed === myId) return toast('Cannot chat with yourself', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${API}/createChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: [myId, trimmed] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const chat = await res.json();
      toast('Chat created!', 'success');
      onCreated(chat);
      onClose();
    } catch (e) {
      toast(`Failed: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">// New Link</div>
        <div className="modal-sub">Initiate a secure channel with another node</div>
        <label className="modal-label">Target User ID</label>
        <input
          id="new-chat-participant-id"
          className="input-field"
          placeholder="Paste their MongoDB ObjectID…"
          value={participantId}
          onChange={e => setParticipantId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Abort</button>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Establish Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main App ───────────────────────────────────────────────── */
export default function App() {
  const [myId, setMyId]               = useState('');
  const [loggedIn, setLoggedIn]       = useState(false);
  const [chats, setChats]             = useState([]);
  const [activeChat, setActiveChat]   = useState(null);
  const [messages, setMessages]       = useState([]);
  const [inputText, setInputText]     = useState('');
  const [uploading, setUploading]     = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingHist, setLoadingHist]   = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const [hasMoreHist, setHasMoreHist]   = useState(false);
  const [wsReady, setWsReady]           = useState(false);

  const socketRef      = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);
  const { toasts, show: toast } = useToast();

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  /* ── Login ── */
  const handleLogin = async () => {
    if (!myId.trim()) return toast('Enter your UserID', 'error');
    setLoadingChats(true);
    try {
      const res = await fetch(`${API}/fetchChats?userID=${myId.trim()}&limit=20`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setChats(list);
      setHasMoreChats(list.length === 20);
      setLoggedIn(true);
    } catch (e) {
      toast(`Auth failed: ${e.message}`, 'error');
    } finally {
      setLoadingChats(false);
    }
  };

  /* ── Load more chats ── */
  const loadMoreChats = async () => {
    if (!chats.length) return;
    const last = chats[chats.length - 1];
    const before = encodeURIComponent(new Date(last.updatedAt).toISOString());
    setLoadingChats(true);
    try {
      const res = await fetch(`${API}/fetchChats?userID=${myId}&limit=20&before=${before}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setChats(prev => [...prev, ...list]);
      setHasMoreChats(list.length === 20);
    } catch {
      toast('Could not load more chats', 'error');
    } finally {
      setLoadingChats(false);
    }
  };

  /* ── Select chat ── */
  const selectChat = async (chat) => {
    setActiveChat(chat);
    setMessages([]);
    setHasMoreHist(false);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setWsReady(false);
    }
    setLoadingHist(true);
    try {
      const res = await fetch(`${API}/fetchHistory?userID=${myId}&chatID=${chat.id}&limit=30`);
      if (!res.ok) throw new Error(await res.text());
      const hist = await res.json();
      const list = Array.isArray(hist) ? hist.reverse() : [];
      setMessages(list);
      setHasMoreHist(list.length === 30);
    } catch (e) {
      toast(`History error: ${e.message}`, 'error');
    } finally {
      setLoadingHist(false);
    }
    openWS(chat);
  };

  /* ── Load more history ── */
  const loadMoreHistory = async () => {
    if (!activeChat || !messages.length) return;
    const oldest = messages[0];
    const before = encodeURIComponent(new Date(oldest.updatedAt || oldest.sentTime).toISOString());
    setLoadingHist(true);
    try {
      const res = await fetch(`${API}/fetchHistory?userID=${myId}&chatID=${activeChat.id}&limit=30&before=${before}`);
      const hist = await res.json();
      const list = Array.isArray(hist) ? hist.reverse() : [];
      setMessages(prev => [...list, ...prev]);
      setHasMoreHist(list.length === 30);
    } catch {
      toast('Could not load older messages', 'error');
    } finally {
      setLoadingHist(false);
    }
  };

  /* ── WebSocket ── */
  const openWS = useCallback((chat) => {
    if (socketRef.current) return;
    const url = `${WS}/ws?userID=${myId}&chatID=${chat.id}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'UPDATE_STATUS') {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: msg.status } : m));
        return;
      }
      setMessages(prev => [...prev, msg]);
    };
    ws.onerror = () => toast('WebSocket error', 'error');
    ws.onclose = () => { socketRef.current = null; setWsReady(false); };
  }, [myId]);

  useEffect(() => () => socketRef.current?.close(), []);

  /* ── Send message ── */
  const sendMessage = (mediaPayload = null) => {
    if (!activeChat) return;
    if (!inputText.trim() && !mediaPayload) return;
    const ensureWS = (cb) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) { cb(); }
      else { openWS(activeChat); setTimeout(cb, 150); }
    };
    ensureWS(() => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return toast('Not connected, please retry', 'error');
      const receiverId = (activeChat.participants || []).find(p => p !== myId) || '';
      const payload = {
        senderId: myId, receiverId,
        data: mediaPayload ? `📎 ${mediaPayload.fileName}` : inputText.trim(),
        media: mediaPayload || null,
        type: 'CHAT',
      };
      socketRef.current.send(JSON.stringify(payload));
      setMessages(prev => [...prev, { ...payload, sentTime: new Date().toISOString(), status: 'sent' }]);
      setInputText('');
    });
  };

  /* ── File upload ── */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('File must be ≤ 10 MB', 'error');
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const info = await res.json();
      sendMessage(info);
    } catch (e) {
      toast(`Upload failed: ${e.message}`, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleChatCreated = (chat) => {
    setChats(prev => [chat, ...prev]);
    selectChat(chat);
  };

  /* ── Login Screen ── */
  if (!loggedIn) {
    return (
      <>
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-logo">Mujhse<span>Baat</span>KarogiNaa</div>
            <div className="login-sub">// Secure neural link initialization</div>
            <input
              id="user-id-input"
              className="input-field"
              placeholder="// Enter your node ID (24-char hex)"
              value={myId}
              onChange={e => setMyId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
            <button id="login-btn" className="btn-primary" onClick={handleLogin} disabled={loadingChats}>
              {loadingChats
                ? <div className="spinner" style={{ width: 16, height: 16, margin: 'auto' }} />
                : '// ESTABLISH CONNECTION'}
            </button>
          </div>
        </div>
        <Toasts toasts={toasts} />
      </>
    );
  }

  /* ── Active chat label & status ── */
  const activeLabel  = activeChat ? chatLabel(activeChat, myId) : '';
  const activeStatus = activeChat ? fakeStatus(activeChat.id) : 'offline';

  /* ── Main UI ── */
  return (
    <>
      <div className="app-shell">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          {/* Header */}
          <div className="sidebar-header">
            <div className="sidebar-title">// SECURE CONTACTS</div>
            <button id="new-chat-btn" className="icon-btn" title="New Link" onClick={() => setShowCreate(true)}>＋</button>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <input className="input-field" placeholder="SEARCH USERS..." readOnly style={{ cursor: 'default' }} />
          </div>

          {/* Chat list */}
          <div className="chat-list">
            {chats.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                No nodes detected — initiate link
              </div>
            )}
            {chats.map(chat => {
              const label  = chatLabel(chat, myId);
              const initials = avatarLetters(label);
              const status = fakeStatus(chat.id);
              return (
                <div
                  key={chat.id}
                  id={`chat-${chat.id}`}
                  className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                  onClick={() => selectChat(chat)}
                >
                  <div className="chat-avatar">
                    {initials}
                    <span className={`avatar-dot ${status}`} />
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{label}</div>
                    <div className="chat-last">
                      {chat.lastMessage?.data || 'no transmissions.'}
                    </div>
                  </div>
                  <div className="chat-meta">
                    <div className="chat-time">{fmtTime(chat.updatedAt)}</div>
                  </div>
                </div>
              );
            })}
            {hasMoreChats && (
              <button className="load-more-btn" onClick={loadMoreChats} disabled={loadingChats}>
                {loadingChats ? '…' : '// Load more nodes'}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="sidebar-status">
            <span className="status-dot" />
            NEURAL LINK ACTIVE
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">
          {!activeChat ? (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <div className="empty-title">// Awaiting target node</div>
              <div className="empty-sub">Select a contact or establish a new link</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-header">
                <div className="chat-header-avatar">{avatarLetters(activeLabel)}</div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{activeLabel}</div>
                  <div className="chat-header-sub">
                    <span className={`status-dot ${activeStatus}`} />
                    {wsReady ? 'ONLINE // ENCRYPTED' : 'CONNECTING…'}
                  </div>
                </div>
                <div className="header-actions">
                  <button className="header-icon-btn" title="Voice">📞</button>
                  <button className="header-icon-btn" title="Video">📹</button>
                  <button className="header-icon-btn" title="Profile">👤</button>
                  <button className="header-icon-btn" title="More">⋮</button>
                </div>
              </div>

              {/* Messages */}
              <div className="messages-area" id="messages-area">
                {hasMoreHist && (
                  <div className="load-more-hist">
                    <button onClick={loadMoreHistory} disabled={loadingHist}>
                      {loadingHist
                        ? <div className="spinner" style={{ width: 12, height: 12, display: 'inline-block' }} />
                        : '↑ Load older transmissions'}
                    </button>
                  </div>
                )}

                {loadingHist && messages.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner" />
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMe = msg.senderId === myId;
                  const prevMsg = messages[idx - 1];
                  const showDate = !prevMsg ||
                    fmtDate(msg.sentTime || msg.updatedAt) !== fmtDate(prevMsg.sentTime || prevMsg.updatedAt);
                  const senderLabel = isMe ? 'ME' : chatLabel({ id: msg.senderId, participants: [msg.senderId] }, '').slice(0, 2) || 'SC';

                  return (
                    <div key={msg.id || idx}>
                      {showDate && (
                        <div className="date-divider">{fmtDate(msg.sentTime || msg.updatedAt)}</div>
                      )}
                      <div className={`msg-row ${isMe ? 'me' : 'them'}`}>
                        {!isMe && (
                          <div className="msg-avatar">{avatarLetters(activeLabel)}</div>
                        )}
                        <div className="msg-bubble">
                          {msg.data && <div>{msg.data}</div>}
                          {msg.media && <MediaBlock media={msg.media} />}
                          <div className="msg-footer">
                            <span className="msg-time">{fmtTime(msg.sentTime || msg.updatedAt)}</span>
                            {isMe && <StatusTick status={msg.status} />}
                          </div>
                        </div>
                        {isMe && (
                          <div className="msg-avatar">ME</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="input-bar">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  id="file-upload-input"
                  onChange={handleFileUpload}
                />
                <button
                  id="attach-btn"
                  className={`upload-btn ${uploading ? 'uploading' : ''}`}
                  title="Attach file (max 10 MB)"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '📎'}
                </button>

                <textarea
                  id="msg-input"
                  className="msg-input"
                  rows={1}
                  placeholder="// ENTER TRANSMISSION..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button
                  id="send-btn"
                  className="send-btn"
                  onClick={() => sendMessage()}
                  disabled={!inputText.trim() && !uploading}
                >
                  ➤ SEND
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {showCreate && (
        <CreateChatModal
          myId={myId}
          onClose={() => setShowCreate(false)}
          onCreated={handleChatCreated}
          toast={toast}
        />
      )}
      <Toasts toasts={toasts} />
    </>
  );
}