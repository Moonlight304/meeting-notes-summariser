from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from core.config import settings
import google.generativeai as genai
import tempfile
import os

# setup genai API key
genai.configure(api_key=settings.GOOGLE_API_KEY)

# use local embeddings
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# setup chroma db
vectorstore = Chroma(
    persist_directory=str(settings.CHROMA_PERSIST_DIRECTORY),
    embedding_function=embeddings
)

# initialize gemini flash model
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=settings.GOOGLE_API_KEY,
    temperature=0.3
)

def add_document(text: str, source: str = "unknown", session_id: str = "unknown"):
    """Splits a document text and adds it to ChromaDB."""
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.create_documents([text], metadatas=[{"source": source, "session_id": session_id}])
    
    if chunks:
        vectorstore.add_documents(chunks)
    return len(chunks)

def transcribe_audio_file(file_path: str) -> str:
    """Uses Gemini 2.5 flash to transcribe audio file content."""
    
    try:
        audio_file = genai.upload_file(path=file_path)
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content([audio_file, "You are a professional transcriber. Transcribe the following meeting audio perfectly. Just output the transcript."])
        genai.delete_file(audio_file.name)
        return response.text
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        raise e

def query_summarizer(question: str, session_id: str = None) -> dict:
    """Query the RAG vectorstore and return answer with sources."""
    
    search_kwargs = {"k": 5}
    
    if session_id and session_id != "unknown":
        search_kwargs["filter"] = {"session_id": session_id}
        
    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    docs = retriever.invoke(question)
    
    # join retrieved chunks
    context_text = "\n\n---\n\n".join([doc.page_content for doc in docs])
    
    system_prompt = (
        "You are an expert meeting note summarizer.\n"
        "Use the following pieces of retrieved context to answer the user's question.\n"
        "If you don't know the answer, just say that you don't know.\n"
        "Focus on highlighting decisions, action items, and key discussions based on the content.\n\n"
        f"CONTEXT:\n{context_text}"
    )

    print('\n ------- CONTEXT TEXT --------- \n')
    print(context_text)
    print('\n ------- CONTEXT TEXT --------- \n')


    try:
        # call llm with complete context
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=question)
        ])
        answer_text = response.content
    except Exception as e:
        error_msg = str(e)
        if "RESOURCE_EXHAUSTED" in error_msg or "429" in error_msg:
            answer_text = " **API Limit Reached:** You have exceeded your free tier Gemini API quota (max requests per minute). Please wait about 30-60 seconds and try again."
        else:
            answer_text = f" **Error:** An unexpected error occurred while generating the answer: {error_msg}"
        
    sources = []
    for doc in docs:
        sources.append({
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown")
        })
        
    return {
        "answer": answer_text,
        "sources": sources
    }
