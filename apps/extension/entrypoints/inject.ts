export default defineUnlistedScript(() => {
  const CHANNEL = "__WEB_AUTOPSY__";

  function post(kind: string, payload: Record<string, unknown>) {
    window.postMessage({ source: CHANNEL, kind, payload }, "*");
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let requestBody: string | undefined;
    try {
      if (init?.body) {
        requestBody = typeof init.body === "string" ? init.body : undefined;
      }
    } catch {
      /* ignore */
    }
    const requestHeaders: Record<string, string> = {};
    try {
      const h = init?.headers;
      if (h instanceof Headers) h.forEach((v, k) => (requestHeaders[k] = v));
      else if (Array.isArray(h)) h.forEach(([k, v]) => (requestHeaders[k] = v));
      else if (h) Object.assign(requestHeaders, h);
    } catch {
      /* ignore */
    }
    try {
      const res = await origFetch(input, init);
      let responseBody: string | undefined;
      try {
        const clone = res.clone();
        const ct = clone.headers.get("content-type") || "";
        if (ct.includes("json") || ct.includes("text")) {
          responseBody = (await clone.text()).slice(0, 512_000);
        }
      } catch {
        /* ignore */
      }
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => (responseHeaders[k] = v));
      post("fetch", {
        method,
        url,
        status: res.status,
        durationMs: performance.now() - started,
        requestHeaders,
        responseHeaders,
        requestBody,
        responseBody,
      });
      return res;
    } catch (err) {
      post("fetch", {
        method,
        url,
        failed: true,
        durationMs: performance.now() - started,
        requestHeaders,
        requestBody,
      });
      throw err;
    }
  };

  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  const setRequestHeader = XHR.setRequestHeader;

  XHR.open = function (method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    (this as XMLHttpRequest & { __wa?: { method: string; url: string; headers: Record<string, string>; started: number } }).__wa = {
      method: String(method).toUpperCase(),
      url: String(url),
      headers: {},
      started: 0,
    };
    return open.call(this, method, url, async ?? true, username, password);
  };

  XHR.setRequestHeader = function (name: string, value: string) {
    const wa = (this as XMLHttpRequest & { __wa?: { headers: Record<string, string> } }).__wa;
    if (wa) wa.headers[name] = value;
    return setRequestHeader.call(this, name, value);
  };

  XHR.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const wa = (this as XMLHttpRequest & {
      __wa?: { method: string; url: string; headers: Record<string, string>; started: number };
    }).__wa;
    if (wa) wa.started = performance.now();
    this.addEventListener("loadend", () => {
      if (!wa) return;
      post("xhr", {
        method: wa.method,
        url: wa.url,
        status: this.status,
        durationMs: performance.now() - wa.started,
        requestHeaders: wa.headers,
        requestBody: typeof body === "string" ? body.slice(0, 512_000) : undefined,
        responseBody: typeof this.responseText === "string" ? this.responseText.slice(0, 512_000) : undefined,
        failed: this.status === 0,
      });
    });
    return send.call(this, body);
  };

  const wrapConsole = (level: "error" | "warn") => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      post("console", {
        level,
        message: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
      });
      return orig(...args);
    };
  };
  wrapConsole("error");
  wrapConsole("warn");

  window.addEventListener("error", (e) => {
    post("console", { level: "error", message: e.message, stack: e.error?.stack });
  });
  window.addEventListener("unhandledrejection", (e) => {
    post("console", {
      level: "error",
      message: String((e as PromiseRejectionEvent).reason),
    });
  });

  try {
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args: unknown[]) {
      post("fingerprint", { api: "canvas.toDataURL" });
      return toDataURL.apply(this, args as []);
    };
  } catch {
    /* ignore */
  }

  try {
    const RTC = window.RTCPeerConnection;
    if (RTC) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).RTCPeerConnection = function (...args: unknown[]) {
        post("fingerprint", { api: "RTCPeerConnection" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (RTC as any)(...args);
      };
      window.RTCPeerConnection.prototype = RTC.prototype;
    }
  } catch {
    /* ignore */
  }
});
