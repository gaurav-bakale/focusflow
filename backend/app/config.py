from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "focusflow"
    JWT_SECRET: str = "changeme"
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
