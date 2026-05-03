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
    const [hasContext, setHasContext] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

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
        setHasContext(false);
        setUploadOpen(false);

        const updated = [{ id, title, date: currDate }, ...currentList];
        saveSessions(updated);
    };

    const loadSession = async (id: string) => {
        setCurrentSession(id);
        setHasContext(false);
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

    const startEditing = (e: React.MouseEvent, session: Session) => {
        e.stopPropagation();
        setEditingSessionId(session.id);
        setEditTitle(session.title);
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
        if (e.key === 'Enter') saveTitle(e, id);
        if (e.key === 'Escape') setEditingSessionId(null);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

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
            setHasContext(true);
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
        <div className="bg-red-500 flex w-screen h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
            {/* Sidebar UI styled with Tailwind */}
            <div className="w-72 border-r border-slate-200 flex flex-col p-6 bg-white">
                <h2 className="text-xl font-semibold mb-8 text-slate-900 tracking-tight">Summarizer</h2>
                <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className={`p-3 rounded-lg cursor-pointer transition-colors border ${s.id === currentSession
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-transparent hover:bg-slate-100'
                                } flex flex-col relative`}
                            onClick={() => loadSession(s.id)}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-slate-500">{s.date}</span>
                                <div className="flex gap-2">
                                    <button
                                        className="text-xs bg-white border border-slate-300 rounded px-2 py-1 hover:bg-indigo-600 hover:text-white transition-colors"
                                        onClick={(e) => startEditing(e, s)}
                                    >
                                        Rename
                                    </button>
                                    <button
                                        className="text-xs bg-white border border-slate-300 rounded px-2 py-1 hover:bg-red-500 hover:text-white transition-colors"
                                        onClick={(e) => deleteSession(e, s.id)}
                                    >
                                        Del
                                    </button>
                                </div>
                            </div>
                            {editingSessionId === s.id ? (
                                <input
                                    autoFocus
                                    className="w-full border-2 border-indigo-600 bg-white p-1 rounded text-sm mt-1 focus:outline-none"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onBlur={(e) => saveTitle(e, s.id)}
                                    onKeyDown={(e) => handleKeyDown(e, s.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <div className="text-sm mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
                                    {s.title}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <button
                    className="mt-4 p-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
                    onClick={() => createNewSession(false)}
                >
                    + New Meeting
                </button>
            </div>

            {/* Chat Area styled with Tailwind */}
            <div className="flex-1 flex flex-col relative bg-slate-50 overflow-hidden">
                {!hasContext ? (
                    <button
                        className="absolute top-4 right-4 z-30 bg-white border border-slate-200 text-slate-800 font-medium px-4 py-2 rounded-md shadow-sm hover:bg-slate-50 transition"
                        onClick={() => setUploadOpen(!uploadOpen)}
                        title="Add Context"
                    >
                        {uploadOpen ? 'Close' : 'Add Context'}
                    </button>
                ) : (
                    <div className="absolute top-4 right-4 z-30 bg-green-100 border border-green-300 text-green-800 font-semibold px-4 py-2 rounded-md shadow-sm">
                        Context Submitted
                    </div>
                )}

                <div
                    className={`absolute top-16 right-4 w-80 bg-white border border-slate-200 rounded-lg p-6 z-20 flex flex-col gap-4 shadow-lg ${uploadOpen && !hasContext ? 'block' : 'hidden'
                        }`}
                >
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
                        <button
                            className={`flex-1 p-2 rounded text-sm ${uploadTab === 'file' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            onClick={() => setUploadTab('file')}
                        >
                            File/Audio
                        </button>
                        <button
                            className={`flex-1 p-2 rounded text-sm ${uploadTab === 'text' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            onClick={() => setUploadTab('text')}
                        >
                            Text
                        </button>
                    </div>

                    {uploadTab === 'file' ? (
                        <div className="border border-dashed border-slate-300 rounded-md p-6 text-center relative bg-slate-50">
                            <input
                                type="file"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e: any) => setUploadFile(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null)}
                                accept=".txt,.pdf,.mp3,.wav,.m4a,.flac"
                            />
                            <div className="text-sm text-slate-500 font-medium mb-2">Upload</div>
                            <p className="text-xs text-slate-400">
                                {uploadFile ? uploadFile.name : 'Drag & drop or click to upload PDF, TXT, or Audio'}
                            </p>
                        </div>
                    ) : (
                        <textarea
                            className="w-full h-32 bg-white border border-slate-300 rounded-md p-3 text-sm focus:outline-none focus:border-slate-400 resize-none"
                            placeholder="Paste meeting notes here..."
                            value={uploadText}
                            onChange={(e) => setUploadText(e.target.value)}
                        />
                    )}

                    <button
                        className={`p-2 rounded-md text-white text-sm font-medium ${isUploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        onClick={handleUpload}
                        disabled={isUploading}
                    >
                        {isUploading ? 'Processing...' : 'Submit Context'}
                    </button>
                </div>

                {/* Chat List */}
                <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full overflow-hidden">
                    <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-8">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] p-5 rounded-xl text-base shadow-sm ${msg.role === 'user'
                                            ? 'bg-indigo-100 text-indigo-900 rounded-br-sm'
                                            : 'bg-white border border-slate-200 rounded-bl-sm'
                                        }`}
                                >
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
                                            <strong>Sources:</strong>
                                            {[...new Set(msg.sources.map((s) => s.source))].map((src, i) => (
                                                <div key={i} className="bg-slate-50 p-2 rounded border border-slate-200 border-l-4 border-l-sky-500 mt-2">
                                                    <span className="text-slate-600">{String(src)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex w-full justify-start">
                                <div className="max-w-[85%] p-5 rounded-xl text-base shadow-sm bg-white border border-slate-200 rounded-bl-sm text-slate-500 italic">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input field */}
                    <div className="mt-4 flex items-end bg-white border border-slate-300 rounded-lg p-2 focus-within:border-slate-500 transition-colors">
                        <textarea
                            className="flex-1 bg-transparent border-none p-3 text-slate-800 font-sans text-base resize-none max-h-40 min-h-[50px] focus:outline-none"
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
                            className="bg-indigo-600 text-white border-none px-5 h-12 rounded-md text-sm font-medium flex items-center justify-center cursor-pointer disabled:bg-indigo-300 disabled:cursor-not-allowed mb-1"
                            onClick={handleSend}
                            disabled={!input.trim() || isTyping}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
