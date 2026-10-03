import { describe, expect, it } from "vitest";
import { istSichereQrSvg, renderQrBlattHtml } from "./qr-blatt.js";

const OK_SVG =
  '<svg height="512" width="512" viewBox="0 0 29 29" role="img"><path fill="#FFFFFF" d="M0,0 h29v29H0z" shape-rendering="crispEdges"></path><path fill="#000000" d="M1 1h1v1H1z" shape-rendering="crispEdges"></path></svg>';

describe("istSichereQrSvg", () => {
  it("akzeptiert die Ausgabe von qrcode.react", () => {
    expect(istSichereQrSvg(OK_SVG)).toBe(true);
  });
  it("lehnt Skripte, Event-Attribute, Bilder und Links ab", () => {
    expect(istSichereQrSvg('<svg><path d="x"></path><script>alert(1)</script></svg>')).toBe(false);
    expect(istSichereQrSvg('<svg onload="x()"><path d="x"></path></svg>')).toBe(false);
    expect(istSichereQrSvg('<svg><image href="http://x"></image></svg>')).toBe(false);
    expect(istSichereQrSvg('<svg><path d="x" style="background:url(http://x)"></path></svg>')).toBe(false);
    expect(istSichereQrSvg("<svg></svg>")).toBe(false);
    expect(istSichereQrSvg(42)).toBe(false);
  });
});

describe("renderQrBlattHtml", () => {
  it("setzt Beschriftung selbst und nimmt nur uebergebene Fahrzeuge auf", () => {
    const html = renderQrBlattHtml([
      { fahrzeugId: "kdo", svg: OK_SVG },
      { fahrzeugId: "zentrale", svg: OK_SVG },
    ]);
    expect(html).toContain("Kommando Eberstalzell");
    expect(html).toContain("FLORIAN");
    expect(html).not.toContain("Tank Eberstalzell");
    // feste Groesse aus dem SVG entfernt, CSS steuert sie
    expect(html).not.toContain('height="512"');
  });
});
