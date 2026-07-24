import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlert } from "@/lib/telegram-alert";

const fetchMock = vi.fn();

describe("telegram alert formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_ALERT_BOT_TOKEN = "token";
    process.env.TELEGRAM_ALERT_CHAT_ID = "chat";
    global.fetch = fetchMock.mockResolvedValue(new Response("{}", { status: 200 })) as typeof fetch;
  });

  it("escapes HTML-mode user content before sending Telegram alerts", async () => {
    await sendAlert({
      dashboard: "Brain <Dashboard>",
      site: "https://brain.example/?x=<y>",
      severity: "error",
      title: "Broken <b>bold</b>",
      details: "Details & <script>alert(1)</script>",
      action: "Click <a href=\"https://evil.example\">here</a>",
      component: "api/<alert>",
      context: "stack <tag> & more",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("Brain &lt;Dashboard&gt;");
    expect(body.text).toContain("Broken &lt;b&gt;bold&lt;/b&gt;");
    expect(body.text).toContain("Details &amp; &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body.text).not.toContain("<script>");
    expect(body.text).not.toContain("<a href");
  });
});
