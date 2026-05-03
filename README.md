# Meeting Notes Summariser

A lightweight, local-first web app to upload meeting notes, PDFs, or audio, and chat with them using RAG. 
Built with a FastAPI server and a React/Vite/Tailwind client.


**Contents (high level)**
- Project purpose and goals
- Architecture and components
- Setup and run (development)
- Core implementation details (end-to-end data flow)
- How to extend and replace components
- Troubleshooting and common issues
- Security, privacy, and limitations

**Prerequisites**
- Python 3.9+ (for the `server`)
- Node.js 18+ and npm (for the `client`)
- Google Generative AI / Gemini API key if you want audio transcription and LLM answers using Gemini

-----

**Project structure (important files)**
- Server entrypoint: [server/main.py](server/main.py)
- API routes: [server/api/routes.py](server/api/routes.py)
- RAG, embedding, LLM helpers: [server/services/llm.py](server/services/llm.py)
- Database models (SQLite): [server/database/models.py](server/database/models.py)
- Client entrypoint: [client/index.html](client/index.html)
- Client app: [client/src/App.tsx](client/src/App.tsx)
- Client API helpers: [client/src/api.ts](client/src/api.ts)
- Client main: [client/src/main.tsx](client/src/main.tsx)
- Tailwind config: [client/tailwind.config.js](client/tailwind.config.js)

-----

**Architecture overview**

1. Client (frontend)
	- Built with React + Vite + TypeScript.
	- UI manages local session metadata in `localStorage` and displays a chat-style interface.
	- Uploads documents or audio to the server (`POST /api/upload`) and sends questions to the server (`POST /api/chat`).

2. Server (backend)
	- FastAPI application exposing REST endpoints under `/api`.
	- Stores conversational history in a local SQLite database (`server/database/models.py`).
	- Stores semantic vectors (embeddings) in a ChromaDB persistent directory.
	- Uses a text splitter to split long documents into overlapping chunks, embeds them with a huggingface SentenceTransformer, stores them in Chroma, and queries Chroma on chat requests.
	- Uses Google Generative AI (Gemini) wrappers for two functions (optional): audio transcription and final answer generation in a Retrieval-Augmented Generation flow.

3. Data stores
	- SQLite: `chat_messages` table stores messages (session_id, role, content, created_at).
	- ChromaDB: stores document chunks with metadata (source filename and session_id) and their embeddings. The Chroma persistent directory is configured via `CHROMA_PERSIST_DIRECTORY`.

-----

**End-to-end data flow**

1. Uploading content (client --> server)
	- The user opens the `Add Context` panel and uploads a file or pastes text.
	- The client sends a `multipart/form-data` POST request to `/api/upload` containing `text` or `file` and a `session_id`.

2. Server processing (server/services/llm.py)
	- Text: passed directly to `add_document()`.
	- PDF: server extracts text per page with `pypdf.PdfReader` and passes the concatenated text to `add_document()`.
	- Audio: server saves the upload to a temporary file and calls `transcribe_audio_file()` which uses `google.generativeai` (Gemini) to transcribe to text (requires API key). The transcription is then handed to `add_document()`.

3. Chunking and embedding (`add_document`)
	- Uses `RecursiveCharacterTextSplitter` to create overlapping chunks (default chunk_size=1000, overlap=200).
	- Each chunk is created as a document with metadata: `source` (original filename) and `session_id`.
	- Embeddings are generated using `sentence-transformers/all-MiniLM-L6-v2` (local Hugging Face embeddings via `HuggingFaceEmbeddings`).
	- Chunks are added to ChromaDB with `vectorstore.add_documents(chunks)`; the configured `persist_directory` keeps the index on disk between runs.

4. Chat / RAG query (client --> server --> LLM)
	- Client sends the chat message and `session_id` to `POST /api/chat`.
	- The server logs the user message in SQLite, then calls `query_summarizer(question, session_id)`.
	- `query_summarizer()` creates a retriever from the Chroma vectorstore and requests the top-k (k=5) chunks, optionally filtered by `session_id` so queries stay session-scoped.
	- Retrieved chunks are concatenated into a single context string, then combined with a system prompt instructing the LLM to be an expert meeting summarizer.
	- The app invokes `ChatGoogleGenerativeAI` (Gemini) with the system prompt and the user question to generate the final answer. The returned answer plus the retrieved source chunks are sent back to the client.
	- The server stores the assistant reply in SQLite so the session history is persistent and can be reloaded.

-----

**API reference**

- `POST /api/upload` — Accepts either `text` (form field) or `file` (multipart). Optional `session_id` form field.
  - Supported file types: `.txt`, `.pdf`, audio (`.mp3`, `.wav`, `.m4a`, `.flac`).
  - For `.pdf`, the server extracts text using PyPDF.
  - For audio, the server calls Gemini to transcribe (if configured).
  - The response returns JSON with `chunks_added` — number of split chunks added to the vector store.

- `POST /api/chat` — Accepts JSON `{ session_id, message }`.
  - The server logs the user message, runs the RAG retrieval + LLM call, logs the assistant response, and returns `{ answer, sources }`.

- `GET /api/history/{session_id}` — Returns an ordered list of messages for the session (role, content, created_at).

-----

**Configuration and environment variables**

Create a `.env` file in the `server/` directory (not committed to git). Example:

```
GOOGLE_API_KEY=your_gemini_api_key_here
CHROMA_PERSIST_DIRECTORY=./vector_store
```

Notes:
- `GOOGLE_API_KEY` is required only if you plan to use Gemini for transcription and/or generation. The code will attempt to use the `google.generativeai` client.
- `CHROMA_PERSIST_DIRECTORY` points to a folder name used by Chroma. Existing indexes will be reused if the directory exists.

-----

**How to run locally (development)**

1. Server (Python / FastAPI)

```bash
cd server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# create .env using the sample above
uvicorn main:app --reload --port 8000
```

2. Client (Vite / React / Tailwind)

```bash
cd client
npm install
npm run dev
```

Open the client URL printed by Vite (usually `http://localhost:5173`).

-----



**Database schema**

`chat_messages` table (defined in [server/database/models.py](server/database/models.py)):

- `id` INTEGER PRIMARY KEY
- `session_id` TEXT
- `role` TEXT (`user` or `assistant`)
- `content` TEXT
- `created_at` DATETIME (UTC)


-----

**Limitations**

- The frontend stores only session metadata in `localStorage`, deleting browser storage can make sessions harder to find even though backend data may persist.
- The retrieval quality depends on the chunking strategy and the embedding model. Tuning `chunk_size` and `chunk_overlap` may improve relevance.
- The current prompt is a simple system message; further prompt engineering can improve answer specificity and citation behavior.

