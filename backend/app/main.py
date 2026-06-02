from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routers import api_keys, chat, drone, health, history, predict
from app.models.classifier import classifier


@asynccontextmanager
async def lifespan(app: FastAPI):
    classifier.load()
    yield


app = FastAPI(title="LeafScan API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(predict.router)
app.include_router(history.router)
app.include_router(api_keys.router)
app.include_router(drone.router)
app.include_router(chat.router)
