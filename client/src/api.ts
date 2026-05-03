import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

console.log(API_URL)

export const uploadDocument = async (text: string | null, file: File | null, sessionId: string) => {
    const formData = new FormData();
    if (text) formData.append('text', text);
    if (file) formData.append('file', file);
    if (sessionId) formData.append('session_id', sessionId);

    const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data;
};

export const sendChatMessage = async (sessionId: string, message: string) => {
    const response = await axios.post(`${API_URL}/chat`, {
        session_id: sessionId,
        message: message
    });
    return response.data;
};

export const getHistory = async (sessionId: string) => {
    const response = await axios.get(`${API_URL}/history/${sessionId}`);
    return response.data;
};
