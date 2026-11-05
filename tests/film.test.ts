import { describe, it, expect } from "vitest";
import { cleanLink, filmSource } from "../src/lib/film";

describe("film links", () => {
  it("recognizes YouTube, Vimeo, uploads and other links", () => {
    expect(filmSource("https://youtu.be/dQw4w9WgXcQ")).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    expect(filmSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    expect(filmSource("https://youtube.com/shorts/abcDEF123")).toEqual({ type: "youtube", id: "abcDEF123" });
    expect(filmSource("https://vimeo.com/123456")).toEqual({ type: "vimeo", id: "123456" });
    expect(filmSource("blob:film/x/clip.mp4")).toEqual({ type: "upload", pathname: "film/x/clip.mp4" });
    expect(filmSource("https://www.hudl.com/video/3/1/abc")).toMatchObject({ type: "link", host: "hudl.com" });
  });
  it("only accepts https links", () => {
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("http://youtu.be/x")).toBeNull();
    expect(cleanLink("not a link")).toBeNull();
    expect(cleanLink(" https://youtu.be/x ")).toBe("https://youtu.be/x");
  });
});
