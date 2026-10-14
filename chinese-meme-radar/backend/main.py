from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.session import engine
from database import models
from api.trends import router as trends_router
from api.animals import router as animals_router
from api.deploy import router as deploy_router
from api.launch import router as launch_router
from jobs.scheduler import start_scheduler, stop_scheduler

# Create database tables
models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: kick off the background scraping scheduler
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="China Meme Radar API",
    description="API for discovering and analyzing Chinese meme trends.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5000", "http://localhost:5000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(trends_router)
app.include_router(animals_router)
app.include_router(deploy_router)
app.include_router(launch_router)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "China Meme Radar API is running."}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
