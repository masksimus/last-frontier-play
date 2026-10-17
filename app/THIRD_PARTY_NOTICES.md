# THIRD_PARTY_NOTICES — Последний рубеж V6

В игру включены компоненты сторонних проектов. Ниже приведены исходные уведомления авторов и тексты лицензий из официальных репозиториев на момент подготовки сборки.

Пакеты в package-lock.json могут содержать дополнительные транзитивные зависимости; этот файл не заменяет их полный аудит перед коммерческой публикацией.

## PixiJS

Источник: https://github.com/pixijs/pixijs
Лицензия: MIT

```text
The MIT License

Copyright (c) 2013-2023 Mathew Groves, Chad Engler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Howler.js

Источник: https://github.com/goldfire/howler.js
Лицензия: MIT

```text
Copyright (c) 2013-2020 James Simpson and GoldFire Studios, Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Vite

Источник: https://github.com/vitejs/vite
Лицензия: MIT

```text
MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


## V9: Three.js / Rapier / licensed model assets

- Three.js 0.180.0 — MIT, https://github.com/mrdoob/three.js. Includes
  GLTFLoader, SkeletonUtils, BufferGeometryUtils and RoomEnvironment.
- Rapier3D compatibility package 0.19.2 — Apache-2.0,
  https://github.com/dimforge/rapier.js. The npm tarball omits a LICENSE file;
  the upstream LICENSE is vendored as assets/models/RAPIER-LICENSE.txt and copied
  into THIRD_PARTY_LICENSES by the packaging script. WASM is bundled locally.
- Kenney Space Kit — CC0-1.0, https://kenney.nl/assets/space-kit.
  Selected independent GLB props and weapons. Original archive license included.
- Quaternius Ultimate Space Kit — CC0-1.0,
  https://quaternius.com/packs/ultimatespacekit.html.
  Astronaut Finn, Enemy Small/Flying/Large and Mech Finn; all contain actual skeletal
  animation clips. Original embedded glTF data packed losslessly into GLB.
  Source folder and per-file SHA-256 are recorded in assets/models/manifest.json.
  The original License.txt in the official Space Kit folder is headed
  "Ultimate Platformer Pack" (upstream label); it is retained verbatim. The official
  Space Kit page independently identifies the kit as CC0. This discrepancy is
  disclosed rather than silently changing the author's license document.

V9 changes model materials at runtime, adds independent armour/visor geometry,
uses source animation clips with crossfades, and batches static prop geometry.
The supplied visual reference is not shipped or sampled as a background.

Existing V8 illustrations, sprite atlases and sounds remain available for the
Canvas fallback and retain their pre-existing provenance. Their authorship was
not independently re-established in this change. The CC0 verification above
covers the newly imported model assets, not an assertion about every legacy file.
