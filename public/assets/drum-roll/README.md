# drum-roll 音源

素材はユーザーが選定したもの。原本の wav はリポジトリ直下の `samples/`（gitignore 済み）に保管し、
配信用に AAC 192kbps の m4a へ変換して同梱している。

```bash
afconvert -f m4af -d aac -b 192000 samples/<name>.wav public/assets/drum-roll/<name>.m4a
```

`snare.m4a` は他の音源と音量差があったため、変換前に -1 dBFS へピークノーマライズしている
（原本 wav のピークは -2.4 dBFS）。

出典はいずれも [freesound.org](https://freesound.org/) の CC0 1.0（パブリックドメイン）素材。

| ファイル  | 原本                | 用途                             | 出典（作者）                                                                                                            |
| --------- | ------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| snare.m4a | `samples/snare.wav` | ロール中の連打                   | [DW - Snare Med Comp (Edit)](https://freesound.org/people/DanVGC++/sounds/689505/)（DanVGC++）                          |
| kick.m4a  | `samples/kick.wav`  | リリース時のジャーン（低音）     | [cSonor Kick1 R06](https://freesound.org/people/gerudobombshell/sounds/88601/)（gerudobombshell）                       |
| crash.m4a | `samples/crash.wav` | リリース時のジャーン（シンバル） | [crash Zildjian 16 inches bassized very long](https://freesound.org/people/Logicogonist/sounds/807998/)（Logicogonist） |
