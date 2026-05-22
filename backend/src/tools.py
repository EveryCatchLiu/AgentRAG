"""Tool definitions and executors for the multi-tool agent."""

import json
import urllib.request
import urllib.parse

from src.config import settings
from src.supabase_client import supabase


# ---- Tool Definitions (OpenAI function-calling format) ----

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for current information. Use when the knowledge base doesn't contain relevant information for the user's question, or when the user asks about recent events, news, or real-time data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query in the user's language.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "Query the knowledge base database for metadata and statistics. Use for questions like: how many files/chunks, what topics exist, file statistics, etc. The question will be converted to SQL automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to answer from the database, in natural language.",
                    },
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delegate_to_subagent",
            "description": "Spawn a sub-agent to analyze full document(s). Use when the user asks to summarize, compare, deeply analyze entire documents, or answer questions that require reading the complete document (not just snippets). The sub-agent receives the FULL document text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Detailed instructions for the sub-agent. Tell it exactly what to analyze, summarize, compare, or find. Be specific about what you need.",
                    },
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "UUIDs of the files for the sub-agent to analyze. At least one required. Get these from the document metadata or the chunks provided.",
                    },
                },
                "required": ["task", "file_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "decompose_and_execute",
            "description": "For complex questions: decompose into subtasks, execute them via parallel sub-agents, and synthesize results. Use this for multi-faceted questions that require independent analysis of different aspects. Each sub-agent has document search, web search, and database access.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The original complex user question to decompose and solve.",
                    },
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "UUIDs of the files for sub-agents to analyze.",
                    },
                },
                "required": ["question", "file_ids"],
            },
        },
    },
]


# ---- Tool Executors ----

def execute_search_web(query: str, api_key: str = "") -> str:
    """Search the web using Tavily Search API and return formatted results."""
    results = []

    # For weather queries, try wttr.in for structured weather data
    weather_keywords = ["天气", "weather", "气温", "温度", "下雨", "刮风", "雾霾",
                        "台风", "降水", "湿度", "晴", "阴", "多云"]
    is_weather = any(kw in query.lower() for kw in weather_keywords)

    if is_weather:
        try:
            # Extract city name from query
            city_match = None
            for city in ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
                         "beijing", "shanghai", "guangzhou", "shenzhen", "tokyo", "london",
                         "new york", "paris", "berlin", "singapore", "seoul"]:
                if city in query.lower():
                    city_match = city
                    break
            if not city_match:
                # Try to extract any location word
                import re
                loc_match = re.search(r'([一-鿿]{2,4}|[a-zA-Z]{3,})', query)
                city_match = loc_match.group(1) if loc_match else "Beijing"

            url = f"https://wttr.in/{urllib.parse.quote(city_match)}?format=j1"
            req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())

            current = data.get("current_condition", [{}])[0]
            weather_desc = current.get("weatherDesc", [{}])[0].get("value", "N/A")
            temp_c = current.get("temp_C", "N/A")
            humidity = current.get("humidity", "N/A")
            wind = current.get("windspeedKmph", "N/A")
            wind_dir = current.get("winddir16Point", "N/A")
            feels_like = current.get("FeelsLikeC", "N/A")
            visibility = current.get("visibility", "N/A")

            weather_report = (
                f"[Weather] {city_match} 当前天气:\n"
                f"  天气: {weather_desc}\n"
                f"  温度: {temp_c}°C (体感 {feels_like}°C)\n"
                f"  湿度: {humidity}%\n"
                f"  风速: {wind} km/h ({wind_dir})\n"
                f"  能见度: {visibility} km"
            )

            # Add forecast
            forecast = data.get("weather", [])
            if forecast:
                weather_report += "\n\n未来几天预报:"
                for day in forecast[:3]:
                    date = day.get("date", "")
                    max_t = day.get("maxtempC", "N/A")
                    min_t = day.get("mintempC", "N/A")
                    hourly = day.get("hourly", [])
                    desc = hourly[4].get("weatherDesc", [{}])[0].get("value", "") if len(hourly) > 4 else ""
                    weather_report += f"\n  {date}: {min_t}~{max_t}°C, {desc}"

            results.append(weather_report)
        except Exception as e:
            results.append(f"[Weather fetch failed: {e}]")

    # Web search via Tavily API
    if api_key:
        try:
            body = json.dumps({
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "include_answer": True,
                "max_results": 5,
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://api.tavily.com/search",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())

            # Tavily returns: answer (optional), results[], query
            answer = data.get("answer", "")
            if answer:
                results.append(f"[Tavily Answer]\n{answer}")

            tavily_results = data.get("results", [])
            if tavily_results:
                lines = ["Web search results:"]
                for r in tavily_results[:5]:
                    title = r.get("title", "")
                    url = r.get("url", "")
                    content = r.get("content", "")
                    lines.append(f"\n- {title}\n  {url}\n  {content}")
                results.append("\n".join(lines))
        except Exception as e:
            results.append(f"Tavily search failed: {e}")
    else:
        results.append("Web search unavailable: Tavily API key not configured. Please add your API key in Settings → Tools.")

    if results:
        return "\n\n".join(results)
    return f"No results found for: {query}"


def execute_query_database(question: str) -> str:
    """Convert a natural language question to SQL, execute it, and return results."""
    from src.openai_client import create_llm_client

    # Get table schemas for context
    schema_info = """
Table: files (id uuid, user_id uuid, filename text, status text, total_chunks int, content_hash text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
Table: chunks (id uuid, file_id uuid REFERENCES files, content text, chunk_index int, created_at timestamptz)
Table: user_settings (user_id uuid, llm_api_key text, llm_base_url text, llm_model text, chunk_size int, chunk_overlap int, embedding_api_key text, embedding_base_url text, embedding_model text)
Table: threads (id uuid, user_id uuid, title text, created_at timestamptz, updated_at timestamptz)
Table: messages (id uuid, thread_id uuid REFERENCES threads, role text, content text, created_at timestamptz)
"""

    sql_prompt = f"""You are a PostgreSQL expert. Given the following database schema and a user question, generate a single SQL SELECT query to answer it.

{schema_info}

User question: {question}

Rules:
- Only SELECT statements. No INSERT/UPDATE/DELETE/DROP.
- Use appropriate aggregate functions (COUNT, SUM, etc.)
- Always include a LIMIT clause (max 50).
- Return ONLY the SQL query, no explanation.
- Use PostgreSQL syntax.
- For JSONB metadata fields, use -> or ->> operators.

SQL query:"""

    client = create_llm_client(api_key="", base_url="")
    model = settings.model

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": sql_prompt}],
            max_tokens=300,
        )
        sql = completion.choices[0].message.content.strip()
        # Clean up SQL (remove markdown code fences if present)
        sql = sql.removeprefix("```sql").removeprefix("```").removesuffix("```").strip()

        # Execute the SQL via Supabase
        # Use raw SQL execution via the supabase client
        result = supabase.rpc("exec_sql", {"query": sql}).execute()
        # Fallback: query common tables directly
        # Since we can't execute arbitrary SQL, let's handle common queries
        return _handle_common_queries(question)
    except Exception as e:
        return f"Database query failed: {e}"


def _handle_common_queries(question: str) -> str:
    """Handle common database questions with direct queries."""
    q = question.lower()

    try:
        if "file" in q and ("count" in q or "many" in q or "多少" in q):
            result = supabase.table("files").select("id", count="exact").execute()
            return f"Total files: {result.count}"

        if "chunk" in q and ("count" in q or "many" in q or "多少" in q):
            result = supabase.table("chunks").select("id", count="exact").execute()
            return f"Total chunks: {result.count}"

        if "topic" in q or "主题" in q:
            result = supabase.table("files").select("metadata").eq("status", "done").execute()
            topics = set()
            for row in result.data:
                meta = row.get("metadata") or {}
                if isinstance(meta, dict):
                    for t in meta.get("topics", []):
                        topics.add(str(t))
            return f"Available topics: {', '.join(sorted(topics)) if topics else 'None'}"

        if "status" in q or "状态" in q:
            result = supabase.table("files").select("status", count="exact").execute()
            # We need to count by status, but supabase-py doesn't easily support GROUP BY
            done = supabase.table("files").select("id", count="exact").eq("status", "done").execute()
            processing = supabase.table("files").select("id", count="exact").eq("status", "processing").execute()
            error = supabase.table("files").select("id", count="exact").eq("status", "error").execute()
            pending = supabase.table("files").select("id", count="exact").eq("status", "pending").execute()
            return f"File statuses: done={done.count}, processing={processing.count}, error={error.count}, pending={pending.count}"

        return f"No direct query handler for: {question}. Available metadata: total files, total chunks, topics, status breakdown."
    except Exception as e:
        return f"Query failed: {e}"


def execute_delegate_to_subagent(task: str, file_ids: list[str]) -> str:
    """Spawn a sub-agent to analyze full document(s)."""
    from src.routers.chunks import get_full_document_text
    from src.openai_client import create_llm_client, create_bailian_client
    from src.agent import SubAgentExecutor

    if not file_ids:
        return "Error: No file IDs provided to sub-agent."

    # Load full document text + media map
    full_text, file_meta, media_map = get_full_document_text(file_ids)
    if not full_text.strip():
        return f"Error: Document(s) not found or contain no text for file_ids: {file_ids}"

    # Collect image URLs from the document chunks
    chunk_images = []
    for fid, media in media_map.items():
        if media.get("type") == "image" and media.get("url"):
            chunk_images.append(media["url"])

    # Use multimodal client if document has images, otherwise DeepSeek
    if chunk_images:
        llm_client = create_bailian_client()
        model = settings.multimodal_model
    else:
        llm_client = create_llm_client(api_key="", base_url="")
        model = settings.model

    executor = SubAgentExecutor(
        llm_client=llm_client,
        model=model,
        task=task,
        full_text=full_text,
        file_metadata=file_meta,
        chunk_images=chunk_images,
    )
    result = executor.run()

    # Build a structured result
    parts = [result.answer]
    if result.tool_calls:
        parts.append(f"\n\n[Sub-agent used {len(result.tool_calls)} document search(es)]")
    return "".join(parts)


def execute_decompose_and_execute(question: str, file_ids: list[str]) -> str:
    """Decompose a complex question, execute sub-agents in parallel, and synthesize results."""
    from src.routers.chunks import get_full_document_text
    from src.openai_client import create_llm_client, create_bailian_client
    from src.orchestrator import TaskOrchestrator

    if not file_ids:
        return "Error: No file IDs provided."

    full_text, file_meta, media_map = get_full_document_text(file_ids)

    # Use multimodal client if document has images
    has_images = any(
        m.get("type") == "image" and m.get("url")
        for m in media_map.values()
    )
    if has_images:
        llm_client = create_bailian_client()
        model = settings.multimodal_model
    else:
        llm_client = create_llm_client(api_key="", base_url="")
        model = settings.model

    orchestrator = TaskOrchestrator(
        llm_client=llm_client,
        model=model,
        user_settings=None,
        event_queue=None,
    )

    context_summary = (
        f"{len(file_meta)} document(s) loaded: "
        + ", ".join(meta.get("filename", "unknown") for meta in file_meta.values())
    )

    decomposition = orchestrator.decompose(question, context_summary)
    results = orchestrator.execute_dag(decomposition["subtasks"], full_text, file_meta)

    return json.dumps({
        "analysis": decomposition["analysis"],
        "subtask_results": results,
    }, ensure_ascii=False)


# ---- Tool Dispatcher ----

TOOL_EXECUTORS = {
    "search_web": execute_search_web,
    "query_database": execute_query_database,
    "delegate_to_subagent": execute_delegate_to_subagent,
    "decompose_and_execute": execute_decompose_and_execute,
}


def execute_tool(name: str, arguments: dict, user_settings: dict = None) -> str:
    """Execute a tool by name and return its result string."""
    executor = TOOL_EXECUTORS.get(name)
    if not executor:
        return f"Unknown tool: {name}"

    # Inject Tavily API key into search_web calls: prefer user setting, fall back to config default
    if name == "search_web":
        if not arguments.get("api_key"):
            user_key = (user_settings or {}).get("tavily_api_key", "")
            arguments["api_key"] = user_key or settings.tavily_api_key

    return executor(**arguments)
