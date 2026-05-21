import sys
from supabase import create_client

SUPABASE_URL = "https://REDACTED.supabase.co"
SERVICE_KEY = "REDACTED_SUPABASE_JWT"

client = create_client(SUPABASE_URL, SERVICE_KEY)

# Check files table
try:
    result = client.table("files").select("*").limit(1).execute()
    print("files table exists")
except Exception as e:
    err = str(e)
    if "does not exist" in err:
        print("files table DOES NOT EXIST")
    else:
        print(f"files error: {err[:200]}")

# Check chunks table
try:
    result = client.table("chunks").select("*").limit(1).execute()
    print("chunks table exists")
except Exception as e:
    err = str(e)
    if "does not exist" in err:
        print("chunks table DOES NOT EXIST")
    else:
        print(f"chunks error: {err[:200]}")

# Check vector extension
try:
    result = client.rpc("check_vector_extension").execute()
except Exception as e:
    err = str(e)
    if "function" in err:
        print("vector extension check: no function")
    else:
        print(f"vector check error: {err[:200]}")
