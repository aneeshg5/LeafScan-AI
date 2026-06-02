from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""
    model_weights_path: str = "./ml/weights/efficientnet_plantvillage.pt"
    supabase_storage_bucket: str = "scan-images"
    openai_api_key: str = ""
    tavily_api_key: str = ""
    serper_api_key: str = ""
    chat_daily_credits: int = 20
    port: int = 8000
    environment: str = "development"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
