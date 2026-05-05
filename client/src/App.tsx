import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import { uploadDocument, sendChatMessage, getHistory } from './api';

interface Message {
    role: string;
    text: string;
    sources?: any[];
}

interface Session {
    id: string;
    title: string;
    date: string;
}

function App() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSession, setCurrentSession] = useState<string>(uuidv4());
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadTab, setUploadTab] = useState<'file' | 'text'>('file');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadText, setUploadText] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    

    useEffect(() => {
        // Load local storage sessions on mount
        const saved = localStorage.getItem('meetingSessions');
        if (saved) {
            const parsed = JSON.parse(saved);
            setSessions(parsed);
            if (parsed.length > 0) {
                loadSession(parsed[0].id);
            } else {
                createNewSession(true);
            }
        } else {
            createNewSession(true);
        }
    }, []);

    const saveSessions = (newSessions: Session[]) => {
        setSessions(newSessions);
        localStorage.setItem('meetingSessions', JSON.stringify(newSessions));
    };

    const createNewSession = (_silent = false, currentList = sessions) => {
        const currDate = new Date().toLocaleDateString();
        const title = `New Meeting (${currDate})`;

        const id = uuidv4();
        setCurrentSession(id);
        setMessages([]);
        setUploadOpen(false);

        const updated = [{ id, title, date: currDate }, ...currentList];
        saveSessions(updated);
    };

    const loadSession = async (id: string) => {
        setCurrentSession(id);
        setUploadOpen(false);
        try {
            const history = await getHistory(id);
            const mapped = history.map((m: any) => ({
                role: m.role,
                text: m.content,
                sources: [],
            }));
            setMessages(mapped);
        } catch (e) {
            console.error('Failed to load history', e);
            setMessages([]);
        }
    };

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = sessions.filter((s) => s.id !== id);
        saveSessions(updated);
        if (currentSession === id) {
            if (updated.length > 0 && updated[0]) {
                loadSession(updated[0].id);
            } else {
                createNewSession(true, []);
            }
        }
    };

    const saveTitle = (e: React.FocusEvent | React.KeyboardEvent, id: string) => {
        e.stopPropagation();
        if (editTitle.trim()) {
            const updated = sessions.map((s) =>
                s.id === id ? { ...s, title: editTitle.trim() } : s
            );
            saveSessions(updated);
        }
        setEditingSessionId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle(e, id);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setEditingSessionId(null);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView();
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!uploadOpen) return;
            const target = event.target as Node;
            if (composerRef.current && !composerRef.current.contains(target)) {
                setUploadOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [uploadOpen]);

    useEffect(() => {
        const handleMenuPointerDown = (event: MouseEvent) => {
            if (!sessionMenuId) return;
            const target = event.target as HTMLElement | null;
            if (!target) return;

            if (target.closest('[data-session-menu]')) return;
            setSessionMenuId(null);
        };

        document.addEventListener('mousedown', handleMenuPointerDown);
        return () => document.removeEventListener('mousedown', handleMenuPointerDown);
    }, [sessionMenuId]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = { role: 'user', text: input };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const response = await sendChatMessage(currentSession, userMsg.text);

            const botMsg = {
                role: 'bot',
                text: response.answer,
                sources: response.sources,
            };
            setMessages((prev) => [...prev, botMsg]);

            if (messages.length === 0) {
                const newTitle = userMsg.text.slice(0, 30) + '...';
                const updatedSessions = sessions.map((s) =>
                    s.id === currentSession ? { ...s, title: newTitle } : s
                );
                saveSessions(updatedSessions);
            }
        } catch (e) {
            console.error(e);
            setMessages((prev) => [
                ...prev,
                { role: 'bot', text: 'Sorry, I encountered an error. Please try again.' },
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleUpload = async () => {
        if (uploadTab === 'file' && !uploadFile) return;
        if (uploadTab === 'text' && !uploadText.trim()) return;

        setIsUploading(true);
        try {
            if (uploadTab === 'file') {
                await uploadDocument(null, uploadFile, currentSession);
            } else {
                await uploadDocument(uploadText, null, currentSession);
            }
            setUploadFile(null);
            setUploadText('');
            setUploadOpen(false);
        } catch (e) {
            console.error(e);
            alert('Failed to upload. Please ensure the backend is running.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
            <aside className="flex w-full max-w-xs flex-col border-r border-slate-800 bg-slate-900/90 p-4 sm:p-5">
                <div className="mb-5 border-b border-slate-800 pb-4">
                    <h2 className="text-lg font-semibold tracking-wide text-slate-100">Meeting Summarizer</h2>
                    <p className="mt-1 text-xs text-slate-400">Dark workspace for your notes and chats</p>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className={`cursor-pointer rounded-xl border p-3 ${
                                s.id === currentSession
                                    ? 'border-cyan-600 bg-slate-800'
                                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                            }`}
                            onClick={() => {
                                setSessionMenuId(null);
                                loadSession(s.id);
                            }}
                        >
                            <div className="relative flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    {editingSessionId !== s.id && (
                                        <>
                                            <div className="truncate text-sm font-medium text-slate-100">{s.title}</div>
                                            <div className="mt-1 text-[11px] text-slate-500">{s.date}</div>
                                        </>
                                    )}
                                    {editingSessionId === s.id && (
                                        <input
                                            autoFocus
                                            className="mt-2 w-full rounded-md border border-cyan-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={(e) => {
                                                e.preventDefault();
                                                saveTitle(e, s.id);
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, s.id)}
                                        />
                                    )}
                                </div>
                                <div className="relative shrink-0" data-session-menu>
                                    <button
                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 hover:border-slate-600 hover:text-slate-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSessionMenuId((current) => (current === s.id ? null : s.id));
                                        }}
                                        type="button"
                                        aria-label="Session actions"
                                    >
                                        ...
                                    </button>

                                    {sessionMenuId === s.id && (
                                        <div
                                            className="absolute right-0 top-10 z-20 w-28 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl shadow-black/30"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                                                onClick={(e) => {
                                                    console.log("CLICKED")
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setSessionMenuId(null);
                                                    setTimeout(() => {
                                                        setEditingSessionId(s.id);
                                                        setEditTitle(s.title);
                                                    }, 0);
                                                }}
                                                type="button"
                                            >
                                                Rename
                                            </button>
                                            <button
                                                className="block w-full px-3 py-2 text-left text-xs text-rose-300 hover:bg-slate-900"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSessionMenuId(null);
                                                    deleteSession(e, s.id);
                                                }}
                                                type="button"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    className="mt-4 rounded-xl border border-cyan-700 bg-cyan-700/20 px-3 py-2.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-700/30"
                    onClick={() => createNewSession(false)}
                >
                    New Meeting
                </button>
            </aside>

            <main className="relative flex flex-1 flex-col overflow-hidden bg-slate-950 p-3 sm:p-4">
                <div className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[86%] rounded-2xl border p-4 text-sm sm:text-base ${msg.role === 'user'
                                            ? 'rounded-br-md border-cyan-700/60 bg-cyan-800/30 text-cyan-100'
                                            : 'rounded-bl-md border-slate-700 bg-slate-900 text-slate-100'
                                        }`}
                                >
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-300">
                                            <strong>Sources:</strong>
                                            {[...new Set(msg.sources.map((s) => s.source))].map((src, i) => (
                                                <div key={i} className="mt-2 rounded-md border border-slate-700 border-l-4 border-l-cyan-500 bg-slate-950 p-2">
                                                    <span className="text-slate-300">{String(src)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex w-full justify-start">
                                <div className="max-w-[86%] rounded-2xl rounded-bl-md border border-slate-700 bg-slate-900 p-4 text-sm italic text-slate-400 sm:text-base">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div ref={composerRef} className="relative flex items-center gap-2 border-t border-slate-800 bg-slate-900 p-3">
                        <div className={`absolute left-3 bottom-full z-20 mb-2 w-80 ${uploadOpen ? 'block' : 'hidden'}`}>
                            <div className="flex flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black/30">
                                <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-950 p-1">
                                    <button
                                        className={`flex-1 rounded-md p-2 text-sm ${uploadTab === 'file' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'}`}
                                        onClick={() => setUploadTab('file')}
                                        type="button"
                                    >
                                        File/Audio
                                    </button>
                                    <button
                                        className={`flex-1 rounded-md p-2 text-sm ${uploadTab === 'text' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'}`}
                                        onClick={() => setUploadTab('text')}
                                        type="button"
                                    >
                                        Text
                                    </button>
                                </div>

                                {uploadTab === 'file' ? (
                                    <div className="relative rounded-lg border border-dashed border-slate-600 bg-slate-950 p-6 text-center">
                                        <input
                                            type="file"
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            onChange={(e: any) => setUploadFile(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null)}
                                            accept=".txt,.pdf,.mp3,.wav,.m4a,.flac"
                                        />
                                        <div className="mb-2 text-sm font-medium text-slate-300">Upload</div>
                                        <p className="text-xs text-slate-500">
                                            {uploadFile ? uploadFile.name : 'Drag & drop or click to upload PDF, TXT, or Audio'}
                                        </p>
                                    </div>
                                ) : (
                                    <textarea
                                        className="h-32 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-cyan-600"
                                        placeholder="Paste meeting notes here..."
                                        value={uploadText}
                                        onChange={(e) => setUploadText(e.target.value)}
                                    />
                                )}

                                <button
                                    className="rounded-lg border border-cyan-700 bg-cyan-700/20 p-2 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={handleUpload}
                                    disabled={isUploading}
                                    type="button"
                                >
                                    {isUploading ? 'Processing...' : 'Submit Context'}
                                </button>
                            </div>
                        </div>

                        <button
                            className="absolute mx-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-lg font-semibold text-slate-200 hover:border-cyan-600"
                            onClick={() => setUploadOpen((prev) => !prev)}
                            title="Add Context"
                            type="button"
                        >
                            +
                        </button>
                        <textarea
                            className="min-h-[26px] max-h-22 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 py-2 pl-16 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-600 sm:text-base"
                            placeholder="Ask about decisions, action items, or summaries..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button
                            className="flex h-12 items-center justify-center rounded-xl border border-cyan-700 bg-cyan-700/20 px-5 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={handleSend}
                            disabled={!input.trim() || isTyping}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
