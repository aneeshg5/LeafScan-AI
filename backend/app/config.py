from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    model_weights_path: str = "./ml/weights/efficientnet_plantvillage.pt"
    supabase_storage_bucket: str = "leaf-images"
    port: int = 8000
    environment: str = "development"

    class Config:
        env_file = ".env"

settings = Settings()
