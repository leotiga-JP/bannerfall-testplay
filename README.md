# Bannerfall Version 4.6.1 — Military Band Morale Sustain

Stable base: Version 4.6.1 / Protocol 460

## 4.6.1 変更点

- 軍楽隊の演奏中（10秒間）、周囲680pxの味方部隊のMoraleが継続回復するよう変更。
- 演奏開始時の既存即時回復（本人+18 / 周囲味方+28）は維持。
- 継続回復は味方+2.5 Morale/秒、軍楽隊自身+1.6 Morale/秒。
- 演奏途中で範囲へ入った味方も継続回復対象。範囲外へ出ると継続回復は停止。
- 継続回復でROUTからRally条件へ到達した場合、既存のRally Recoveryへ移行。
- Network Schema変更なし。Protocol 460を維持。

## 4.6.0 変更点

### 迫撃砲調整
- 迫撃砲弾速を `360 -> 720` に変更し、着弾までの時間をおおよそ半分へ短縮。
- 迫撃砲の展開時間を `1.8秒` に変更。
- 迫撃砲は引き続き山岳・建築物を越える曲射砲。通常砲兵の遮蔽ルールは維持。

### Multi-Team Foundation
- Team型を BLUE / RED / YELLOW / GREEN の4Teamへ汎用化。
- `平原` はRoom作成時に 2 / 3 / 4 Teamを選択可能。
- `河川` は従来どおり2Team専用。
- 3/4Team戦は初期実装では `BATTLE` 専用。CONQUEST / 資源 / 建築は安定性維持のため2Teamのまま。
- 各Teamの部隊数を個別指定可能。完全非対称戦に対応。
- FactionはActive Team間で重複しないようServer側でも正規化。
- 平原のSpawn / Banner配置をTeam数に応じてBLUE・RED・YELLOW・GREENへ拡張。
- AIは固定の「反対Team」ではなく、自Team以外の敵Formation / 敵Bannerから対象を選択。
- BATTLE勝利条件を「最後までBannerが残ったTeam」に一般化。
- Respawn /途中参加 / Reconnect / Formation IDを4Team対応。
- Room Browser / Lobby / Team選択 / Scoreboard / Map Previewを最大4Team対応。
- Team UIは2列配置（BLUE/RED、YELLOW/GREEN）。
- 戦場Banner HUDも最大4Teamを2列表示。
- 3/4Teamでは既存の2陣営Intro Movieを自動SKIP。

## 現時点のスコープ

4.6.0はMulti-Teamの基盤を安全に導入する版です。

- 2Team: BATTLE / CONQUESTとも従来どおり利用可能。
- 3/4Team: `平原 + BATTLE` のみ。
- 3/4Team CONQUEST（Capture/Ticket/Resource/Constructionの完全汎用化）は次段階で実装予定。

## Version
- Game Version: `4.6.1`
- Protocol Version: `460`
- root package: `0.4.6-1`
- server package: `0.4.6-1`

Network Schemaを変更したため、Client / Serverを必ずProtocol 460で同時更新してください。
