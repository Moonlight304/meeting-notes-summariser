import os
import tempfile
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import models
from pydantic import BaseModel
from pypdf import PdfReader

from services.llm import add_document, transcribe_audio_file, query_summarizer

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]

class HistoryResponse(BaseModel):
    role: str
    content: str
    created_at: str

@router.post("/upload")
def upload_document(
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    session_id: Optional[str] = Form(None)
):
    if not text and not file:
        raise HTTPException(status_code=400, detail="Must provide text or file.")
    
    docs_added = 0
    if text:
        docs_added += add_document(text, source="Direct Text Input", session_id=session_id)
    
    if file:
        file_ext = file.filename.split('.')[-1].lower()

        # text files
        if file_ext in ['txt']:
            content = file.file.read()
            docs_added += add_document(content.decode('utf-8'), source=file.filename, session_id=session_id)

        # pdf files
        elif file_ext in ['pdf']:
            content = file.file.read()

            with tempfile.NamedTemporaryFile(delete=False) as temp:
                temp.write(content)
                temp_path = temp.name
            
            try:
                reader = PdfReader(temp_path)
                pdf_text = ""
                for page in reader.pages:
                    pdf_text += page.extract_text() + "\n"
                docs_added += add_document(pdf_text, source=file.filename, session_id=session_id)
            finally:
                os.unlink(temp_path)
                
        # audio files
        elif file_ext in ['mp3', 'wav', 'm4a', 'flac']:
            content = file.file.read()
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp:
                temp.write(content)
                temp_path = temp.name
            
            try:
                transcription = transcribe_audio_file(temp_path)
                docs_added += add_document(transcription, source=f"Audio: {file.filename}", session_id=session_id)
            finally:
                os.unlink(temp_path)
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")
            
    return {"message": "Processing complete", "chunks_added": docs_added}


@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, db: Session = Depends(models.get_db)):
    # log user query

    user_msg = models.ChatMessage(session_id=req.session_id, role="user", content=req.message)
    
    db.add(user_msg)
    db.commit()
    
    # hit rag logic
    result = query_summarizer(req.message, req.session_id)
    
    # log ai response
    bot_msg = models.ChatMessage(session_id=req.session_id, role="assistant", content=result["answer"])
    db.add(bot_msg)
    db.commit()
    
    return {"answer": result["answer"], "sources": result["sources"]}

@router.get("/history/{session_id}")
def get_history(session_id: str, db: Session = Depends(models.get_db)):
    messages = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).order_by(models.ChatMessage.created_at).all()
    return [{"role": msg.role, "content": msg.content, "created_at": msg.created_at.isoformat()} for msg in messages]
