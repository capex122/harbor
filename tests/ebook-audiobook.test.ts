import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("audiobook plugin methods are optional and old eBook plugins remain valid", async () => {
  const extensions = await readFile(
    new URL("../src/lib/ebook/extensions.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(extensions, /every\(\(method\).*audiobookChapters/);

  const providers = await readFile(
    new URL("../src/lib/ebook/providers.ts", import.meta.url),
    "utf8",
  );
  assert.match(providers, /sourceEBookAudiobookChapters/);
  assert.match(providers, /sourceEBookAudiobookStream/);
  assert.match(providers, /no method: audiobookChapters/);
});

test("audiobook playback has durable progress and core controls", async () => {
  const player = await readFile(
    new URL("../src/views/ebook/audiobook-player.tsx", import.meta.url),
    "utf8",
  );
  assert.match(player, /saveEBookListeningProgress/);
  assert.match(player, /pagehide/);
  assert.match(player, /type="range"/);
  assert.match(player, /playbackRate/);
  assert.match(player, /position - 15/);
  assert.match(player, /position \+ 15/);
});

test("local folders discover M4B audiobooks and expose playable asset URLs", async () => {
  const providers = await readFile(
    new URL("../src/lib/ebook/providers.ts", import.meta.url),
    "utf8",
  );
  assert.match(providers, /m4b\|m4a\|mp3/);
  assert.match(providers, /provider\.audiobookChapters = async/);
  assert.match(providers, /convertFileSrc\(path\)/);
  assert.match(providers, /ebook_audio_cover/);
  assert.match(providers, /ebook_audio_chapters/);
  assert.match(providers, /ebook_audio_zip_entries/);
  assert.match(providers, /ebook_audio_zip_extract/);
  assert.match(providers, /ebook_audio_zip_cover/);
  assert.match(providers, /book\|volume\|vol/);
  assert.match(providers, /internalCover: cover/);
});
