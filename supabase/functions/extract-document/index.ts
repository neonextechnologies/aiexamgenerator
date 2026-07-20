import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { documentId, filePath, fileName, fileType } = await req.json();

    if (!documentId || !filePath) {
      return new Response(
        JSON.stringify({ error: "Missing documentId or filePath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    await supabase
      .from("documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("course-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      await supabase
        .from("documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return new Response(
        JSON.stringify({ error: "Failed to download file from storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extractedText = "";

    if (fileType.includes("text/plain") || fileType.includes("text/markdown") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      extractedText = await fileData.text();
    } else if (fileType.includes("application/pdf") || fileName.endsWith(".pdf")) {
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const decoder = new TextDecoder("latin1");
      const rawText = decoder.decode(bytes);
      const textChunks: string[] = [];
      const regex = /BT\s*(.*?)\s*ET/gs;
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const block = match[1];
        const textRegex = /\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/gs;
        let textMatch;
        while ((textMatch = textRegex.exec(block)) !== null) {
          const text = textMatch[1] || textMatch[2];
          if (text) {
            const decoded = text
              .replace(/\\n/g, "\n")
              .replace(/\\r/g, "\r")
              .replace(/\\t/g, "\t")
              .replace(/\\\(/g, "(")
              .replace(/\\\)/g, ")")
              .replace(/\\\\/g, "\\");
            textChunks.push(decoded);
          }
        }
      }
      extractedText = textChunks.join(" ").replace(/\s+/g, " ").trim();
      if (!extractedText) {
        const readableRegex = /[\x20-\x7E\u0E00-\u0E7F]{4,}/g;
        const readable = rawText.match(readableRegex);
        if (readable) {
          extractedText = readable.join(" ").trim();
        }
      }
    } else if (fileType.includes("application/vnd.openxmlformats") || fileName.endsWith(".docx")) {
      const arrayBuffer = await fileData.arrayBuffer();
      const decoder = new TextDecoder("utf-8");
      const rawText = decoder.decode(new Uint8Array(arrayBuffer));
      const textRegex = /<(?:w:t|w:p)[^>]*>([^<]*)<\/(?:w:t|w:p)>/g;
      const textChunks: string[] = [];
      let match;
      while ((match = textRegex.exec(rawText)) !== null) {
        if (match[1]) textChunks.push(match[1]);
      }
      extractedText = textChunks.join(" ").trim();
      if (!extractedText) {
        const readableRegex = /[\x20-\x7E\u0E00-\u0E7F]{10,}/g;
        const readable = rawText.match(readableRegex);
        if (readable) extractedText = readable.join(" ").trim();
      }
    } else {
      try {
        extractedText = await fileData.text();
      } catch {
        extractedText = "";
      }
    }

    extractedText = extractedText.replace(/\x00/g, "").trim();
    if (extractedText.length > 50000) {
      extractedText = extractedText.slice(0, 50000) + "\n...[truncated]";
    }

    if (!extractedText) {
      await supabase
        .from("documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return new Response(
        JSON.stringify({ error: "Could not extract text from file. For PDF/DOCX, ensure the file contains selectable text (not scanned images)." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        extracted_text: extractedText,
        status: "indexed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to save extracted text" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        extractedTextPreview: extractedText.slice(0, 500),
        extractedTextLength: extractedText.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
