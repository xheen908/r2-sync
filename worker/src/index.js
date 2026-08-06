export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. PUBLIC DOWNLOAD LINK ENDPOINT: /s/:shareId
    if (path.startsWith("/s/")) {
      const shareId = path.replace("/s/", "");

      if (!shareId || shareId.length < 16) {
        return new Response("Ungültiger oder abgelaufener Link", { status: 400 });
      }

      const metaObject = await env.MY_BUCKET.get(`.shares/${shareId}.json`);
      if (!metaObject) {
        return new Response("Datei oder Freigabelink nicht gefunden oder abgelaufen.", { status: 404 });
      }

      const shareData = await metaObject.json();

      if (shareData.expiresAt && Date.now() > shareData.expiresAt) {
        return new Response("Dieser Freigabelink ist abgelaufen.", { status: 410 });
      }

      const fileObject = await env.MY_BUCKET.get(shareData.targetFilePath);
      if (!fileObject) {
        return new Response("Originaldatei nicht mehr im Bucket vorhanden.", { status: 404 });
      }

      const headers = new Headers();
      fileObject.writeHttpMetadata(headers);
      headers.set("etag", fileObject.httpEtag);
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(shareData.filename)}"`);

      return new Response(fileObject.body, { headers });
    }

    // 2. PROTECTED ADMIN API ENDPOINT: /api/share (LINK GENERATION)
    if (path === "/api/share" && request.method === "POST") {
      const authKey = request.headers.get("X-API-Key");
      if (!authKey || authKey !== env.ADMIN_SECRET_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      const body = await request.json();
      const { filePath, ttlHours } = body;

      if (!filePath) {
        return new Response(JSON.stringify({ error: "filePath is required" }), { status: 400 });
      }

      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const shareId = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

      const filename = filePath.split("/").pop() || "download";
      const expiresAt = ttlHours ? Date.now() + (ttlHours * 3600 * 1000) : null;

      const shareData = {
        shareId,
        targetFilePath: filePath,
        filename,
        createdAt: Date.now(),
        expiresAt
      };

      await env.MY_BUCKET.put(`.shares/${shareId}.json`, JSON.stringify(shareData));

      const shareUrl = `${env.BASE_URL || url.origin}/s/${shareId}`;

      return new Response(JSON.stringify({
        success: true,
        shareId,
        shareUrl,
        expiresAt
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("R2 Share Worker active", { status: 200 });
  }
};
