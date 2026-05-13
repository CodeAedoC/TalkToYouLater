import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = import.meta.env.VITE_API_URL;
const WS  = import.meta.env.VITE_WS_URL;

/* ─── Helpers ─────────────────────────────────────────────────── */
function sortChats(list) {
  return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
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

/* Get display name from otherParticipants or fall back to ID slice */
function chatDisplayName(chat, myId) {
  const others = (chat.otherParticipants || []).filter(p => p.id !== myId);
  if (others.length > 0) return others[0].name || others[0].mobileNumber || others[0].id?.slice(-8).toUpperCase();
  // fallback: participants array of IDs
  const otherId = (chat.participants || []).find(p => p !== myId);
  return otherId ? otherId.slice(-8).toUpperCase() : (chat.id || '').slice(-8).toUpperCase();
}

function avatarLetters(label = '') {
  const parts = label.replace(/[^A-Z0-9]/gi, ' ').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/* ─── Toast ────────────────────────────────────────────────────── */
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
      {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
    </div>
  );
}

/* ─── Status tick ──────────────────────────────────────────────── */
function StatusTick({ status }) {
  if (!status) return null;
  if (status === 'sent')      return <span className="msg-status sent"     title="Sent">✓</span>;
  if (status === 'delivered') return <span className="msg-status delivered" title="Delivered">✓✓</span>;
  if (status === 'read')      return <span className="msg-status read"      title="Read">✓✓</span>;
  return null;
}

/* ─── Media renderer ──────────────────────────────────────────── */
async function downloadMedia(url, fileName) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // fallback: open in new tab
    window.open(url, '_blank');
  }
}

function MediaBlock({ media }) {
  if (!media) return null;
  const url = `${API}${media.url}`;

  if (isImage(media.fileName)) return (
    <div className="media-img-wrap">
      <img className="media-img" src={url} alt={media.fileName} />
      <button
        className="media-dl-btn"
        title="Download image"
        onClick={() => downloadMedia(url, media.fileName)}
      >⬇ Download</button>
    </div>
  );

  if (isVideo(media.fileName)) return (
    <div style={{ marginTop: 6 }}>
      <video controls style={{ maxWidth: 240, borderRadius: 3, display: 'block', border: '1px solid rgba(0,229,255,0.2)' }}>
        <source src={url} />
      </video>
      <button
        className="media-dl-btn media-dl-btn--video"
        title="Download video"
        onClick={() => downloadMedia(url, media.fileName)}
      >⬇ Download</button>
    </div>
  );

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

/* ─── Auth Screen ─────────────────────────────────────────────── */
function AuthScreen({ onAuth, toast, loading }) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = () => {
    if (tab === 'signup' && !name.trim()) return toast('Enter your name', 'error');
    if (!mobile.trim()) return toast('Enter your mobile number', 'error');
    onAuth(tab, mobile.trim(), name.trim());
  };

  return (
    <>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">Mujhse<span>Baat</span>KarogiNaa</div>
          <div className="login-sub">// Secure neural link initialization</div>

          <div className="auth-tabs">
            <button id="tab-login" className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>LOGIN</button>
            <button id="tab-signup" className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>SIGN UP</button>
          </div>

          {tab === 'signup' && (
            <input
              id="signup-name-input"
              className="input-field"
              placeholder="// Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          )}

          <input
            id="auth-mobile-input"
            className="input-field"
            placeholder="// Mobile number"
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus={tab === 'login'}
          />

          <button id="auth-submit-btn" className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading
              ? <div className="spinner" style={{ width: 16, height: 16, margin: 'auto' }} />
              : tab === 'login' ? '// ESTABLISH CONNECTION' : '// CREATE ACCOUNT'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Create Chat Modal ───────────────────────────────────────── */
function CreateChatModal({ currentUser, onClose, onCreated, toast }) {
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = mobile.trim();
    if (!trimmed) return toast('Enter a mobile number', 'error');
    if (trimmed === currentUser.mobileNumber) return toast('Cannot chat with yourself', 'error');
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/createChat?id=${encodeURIComponent(currentUser.id)}&mobileNumber=${encodeURIComponent(trimmed)}`
      );
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
        <label className="modal-label">Target Mobile Number</label>
        <input
          id="new-chat-mobile-input"
          className="input-field"
          placeholder="Enter their mobile number…"
          value={mobile}
          onChange={e => setMobile(e.target.value)}
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

/* ─── Main App ────────────────────────────────────────────────── */
export default function App() {
  const [currentUser, setCurrentUser] = useState(null); // { id, name, mobileNumber }
  const [chats, setChats]             = useState([]);
  const [activeChat, setActiveChat]   = useState(null);
  const [messages, setMessages]       = useState([]);
  const [inputText, setInputText]     = useState('');
  const [uploading, setUploading]     = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingHist, setLoadingHist]   = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const [hasMoreHist, setHasMoreHist]   = useState(false);
  const [wsReady, setWsReady]           = useState(false);

  const socketRef      = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);
  const { toasts, show: toast } = useToast();

  const myId = currentUser?.id;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* ── Auth (login / signup) ── */
  const handleAuth = async (mode, mobile, name) => {
    setLoadingAuth(true);
    try {
      let url = mode === 'login'
        ? `${API}/login?mobileNumber=${encodeURIComponent(mobile)}`
        : `${API}/signup?mobileNumber=${encodeURIComponent(mobile)}&name=${encodeURIComponent(name)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const user = await res.json();
      setCurrentUser(user);

      // Fetch chats after auth
      const cr = await fetch(`${API}/fetchChats?userID=${user.id}&limit=20`);
      if (!cr.ok) throw new Error(await cr.text());
      const data = await cr.json();
      const list = Array.isArray(data) ? data : [];
      setChats(sortChats(list));
      setHasMoreChats(list.length === 20);
      toast(`Welcome, ${user.name}!`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoadingAuth(false);
    }
  };

  /* ── Refresh chats (also called on NEW_CHAT ws event) ── */
  const refreshChats = useCallback(async (userId) => {
    try {
      const res = await fetch(`${API}/fetchChats?userID=${userId}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setChats(sortChats(list));
      setHasMoreChats(list.length === 20);
    } catch { /* silently ignore */ }
  }, []);

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
      setChats(prev => sortChats([...prev, ...list]));
      setHasMoreChats(list.length === 20);
    } catch { toast('Could not load more chats', 'error'); }
    finally { setLoadingChats(false); }
  };

  /* ── Select chat ── */
  const selectChat = async (chat) => {
    setActiveChat(chat);
    setMessages([]);
    setHasMoreHist(false);
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; setWsReady(false); }
    setLoadingHist(true);
    try {
      const res = await fetch(`${API}/fetchHistory?userID=${myId}&chatID=${chat.id}&limit=30`);
      if (!res.ok) throw new Error(await res.text());
      const hist = await res.json();
      const list = Array.isArray(hist) ? hist.reverse() : [];
      setMessages(list);
      setHasMoreHist(list.length === 30);
    } catch (e) { toast(`History error: ${e.message}`, 'error'); }
    finally { setLoadingHist(false); }
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
    } catch { toast('Could not load older messages', 'error'); }
    finally { setLoadingHist(false); }
  };

  /* ── WebSocket ── */
  const openWS = useCallback((chat) => {
    if (socketRef.current) return;
    const ws = new WebSocket(`${WS}/ws?userID=${myId}&chatID=${chat.id}`);
    socketRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'UPDATE_STATUS') {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: msg.status } : m));
        return;
      }
      if (msg.type === 'NEW_CHAT') {
        // Someone created a chat with us — refresh the sidebar
        refreshChats(myId);
        toast('New chat initiated!', 'info');
        return;
      }
      setMessages(prev => [...prev, msg]);
    };
    ws.onerror = () => toast('WebSocket error', 'error');
    ws.onclose = () => { socketRef.current = null; setWsReady(false); };
  }, [myId, refreshChats]);

  useEffect(() => () => socketRef.current?.close(), []);

  /* ── Send message ── */
  const sendMessage = (mediaPayload = null) => {
    if (!activeChat) return;
    if (!inputText.trim() && !mediaPayload) return;
    const ensureWS = (cb) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) cb();
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
      sendMessage(await res.json());
    } catch (e) { toast(`Upload failed: ${e.message}`, 'error'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleChatCreated = (chat) => {
    setChats(prev => sortChats([chat, ...prev]));
    selectChat(chat);
  };

  /* ── Auth Screen ── */
  if (!currentUser) {
    return (
      <>
        <AuthScreen onAuth={handleAuth} toast={toast} loading={loadingAuth} />
        <Toasts toasts={toasts} />
      </>
    );
  }

  /* ── Derived display values ── */
  const activeName   = activeChat ? chatDisplayName(activeChat, myId) : '';
  const activeInitials = avatarLetters(activeName);

  /* ── Main UI ── */
  return (
    <>
      <div className="app-shell">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">// SECURE CONTACTS</div>
            <button id="new-chat-btn" className="icon-btn" title="New Link" onClick={() => setShowCreate(true)}>＋</button>
          </div>

          <div className="sidebar-search">
            <input className="input-field" placeholder="SEARCH USERS..." readOnly style={{ cursor: 'default' }} />
          </div>

          <div className="chat-list">
            {chats.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
                No nodes detected — initiate link
              </div>
            )}
            {chats.map(chat => {
              const label    = chatDisplayName(chat, myId);
              const initials = avatarLetters(label);
              const other    = (chat.otherParticipants || []).find(p => p.id !== myId);
              return (
                <div
                  key={chat.id}
                  id={`chat-${chat.id}`}
                  className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
                  onClick={() => selectChat(chat)}
                >
                  <div className="chat-avatar">
                    {initials}
                    <span className="avatar-dot online" />
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{label}</div>
                    <div className="chat-last">
                      {other?.mobileNumber && <span style={{ opacity: 0.5, fontSize: 9, marginRight: 4 }}>{other.mobileNumber}</span>}
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

          {/* Footer: show current user info */}
          <div className="sidebar-status">
            <span className="status-dot" />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 10 }}>{currentUser.name}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{currentUser.mobileNumber}</span>
            </span>
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
                <div className="chat-header-avatar">{activeInitials}</div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{activeName}</div>
                  <div className="chat-header-sub">
                    <span className={`status-dot ${wsReady ? 'online' : ''}`} />
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
                  const isMe    = msg.senderId === myId;
                  const prevMsg = messages[idx - 1];
                  const showDate = !prevMsg ||
                    fmtDate(msg.sentTime || msg.updatedAt) !== fmtDate(prevMsg.sentTime || prevMsg.updatedAt);

                  return (
                    <div key={msg.id || idx}>
                      {showDate && <div className="date-divider">{fmtDate(msg.sentTime || msg.updatedAt)}</div>}
                      <div className={`msg-row ${isMe ? 'me' : 'them'}`}>
                        {!isMe && <div className="msg-avatar">{activeInitials}</div>}
                        <div className="msg-bubble">
                          {msg.data && <div>{msg.data}</div>}
                          {msg.media && <MediaBlock media={msg.media} />}
                          <div className="msg-footer">
                            <span className="msg-time">{fmtTime(msg.sentTime || msg.updatedAt)}</span>
                            {isMe && <StatusTick status={msg.status} />}
                          </div>
                        </div>
                        {isMe && <div className="msg-avatar">{avatarLetters(currentUser.name)}</div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="input-bar">
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} id="file-upload-input" onChange={handleFileUpload} />
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
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
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
          currentUser={currentUser}
          onClose={() => setShowCreate(false)}
          onCreated={handleChatCreated}
          toast={toast}
        />
      )}
      <Toasts toasts={toasts} />
    </>
  );
}