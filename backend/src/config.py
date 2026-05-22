from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # DeepSeek official (text-only LLM)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    # Alibaba Bailian (multimodal LLM fallback + embedding)
    bailian_api_key: str = ""
    bailian_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    multimodal_model: str = "qwen3-vl"
    embedding_api_key: str = ""
    embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "qwen3-vl-embedding"
    enable_embedding_fusion: bool = True
    mistral_api_key: str = ""
    tavily_api_key: str = "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"
    langchain_tracing_v2: str = "true"
    langchain_api_key: str = ""
    langchain_project: str = "agentrag-module1"

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
