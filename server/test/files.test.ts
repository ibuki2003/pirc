import { assertEquals } from "@std/assert";
import { fileResponse } from "../http/files.ts";
import type { Registry } from "../core/registry.ts";

Deno.test("file proxy streams inline PDF and honors byte ranges", async () => {
  const data = "%PDF-test";
  const requests: unknown[] = [];
  const host = {
    peer: {
      request: (
        method: string,
        params: { path: string; offset: number; length: number },
      ) => {
        assertEquals(method, "host.file");
        requests.push(params);
        return Promise.resolve({
          path: "/work/report.pdf",
          size: data.length,
          data: btoa(data.slice(params.offset, params.offset + params.length)),
        });
      },
    },
  } as unknown as ReturnType<Registry["host"]>;
  const url = "http://localhost/api/sessions/i/file?path=report.pdf";
  const full = await fileResponse(new Request(url), host);
  assertEquals(full.status, 200);
  assertEquals(full.headers.get("Content-Type"), "application/pdf");
  assertEquals(
    full.headers.get("Content-Disposition"),
    `inline; filename="report.pdf"; filename*=UTF-8''report.pdf`,
  );
  assertEquals(await full.text(), data);
  assertEquals(requests[1], {
    path: "/work/report.pdf",
    offset: 0,
    length: data.length,
  });

  for (const range of ["bytes=1-3", "bytes=-3", "bytes=5-"]) {
    const response = await fileResponse(
      new Request(url, { headers: { Range: range } }),
      host,
    );
    assertEquals(response.status, 206);
    assertEquals(
      response.headers.get("Content-Disposition"),
      full.headers.get("Content-Disposition"),
    );
    assertEquals(
      await response.text(),
      range === "bytes=1-3" ? "PDF" : range === "bytes=-3" ? "est" : "test",
    );
  }
  const invalid = await fileResponse(
    new Request(url, { headers: { Range: "bytes=99-" } }),
    host,
  );
  assertEquals(invalid.status, 416);
  assertEquals(invalid.headers.get("Content-Range"), `bytes */${data.length}`);
});

Deno.test("file proxy encodes the resolved basename for download", async () => {
  const filename = '資料 "report" (1)\'*.pdf';
  const host = {
    peer: {
      request: () =>
        Promise.resolve({
          path: `/work/${filename}`,
          size: 0,
          data: "",
        }),
    },
  } as unknown as ReturnType<Registry["host"]>;
  const response = await fileResponse(
    new Request("http://localhost/api/sessions/i/file?path=alias"),
    host,
  );
  assertEquals(
    response.headers.get("Content-Disposition"),
    `inline; filename="__ _report_ (1)'*.pdf"; filename*=UTF-8''%E8%B3%87%E6%96%99%20%22report%22%20%281%29%27%2A.pdf`,
  );
  await response.text();
});
