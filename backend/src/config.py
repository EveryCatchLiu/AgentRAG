from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    embedding_api_key: str = ""
    embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "text-embedding-v3"
    mistral_api_key: str = ""
    tavily_api_key: str = "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"
    langchain_tracing_v2: str = "true"
    langchain_api_key: str = ""
    langchain_project: str = "agentrag-module1"

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
