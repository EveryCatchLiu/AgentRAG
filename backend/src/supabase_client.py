from supabase import create_client, Client
from src.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)
storage_bucket = supabase.storage.from_("documents")
