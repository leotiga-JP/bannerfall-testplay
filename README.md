# Bannerfall Version 4.0.7 — Base Recovery / Artillery Range Hotfix

Version 4.0.7 は Version 4.0.6 を基準にした Hotfix です。

- Game Version: `4.0.7`
- Protocol Version: `403`（変更なし）

## 修正内容

- Spawn Areaでの補充完了時にFormationをSpawn座標へワープさせていた処理を廃止。補充は現在位置で完了します。
- 補充タイマーは「Spawn Area内で停止して待機」している時だけ進行します。移動中・強行軍中は進行せず、タイマーは解除されます。
- 砲兵射程判定を `artilleryProfile()` / `artilleryTargetIssue()` に集約し、Client表示・Client入力判定・Server射撃判定の基準を統一しました。
- Multiplayerの射程リング中心は、補間表示中のFormation中心ではなく最新のAuthoritative Snapshot位置を使用します。
- HUDに現在の照準距離と「射程内 / 射程外」を表示します。
- 重砲兵の最大射程を `6,300 -> 11,000` に延長し、野戦砲兵（7,875）との差を明確化しました。
- 騎馬砲兵を含む全砲兵で同一の射程表示・判定経路を使用します。

## 現在の砲兵射程

- 野戦砲兵: `300 – 7,875`
- 重砲兵: `480 – 11,000`
- 騎馬砲兵: `230 – 5,325`

## 適用

ZIP内のファイルを `bannerfall-testplay` へ上書きしてください。

- Server再起動: **必要**
- `npm install`: **不要**
- `deploy.yml`: **変更不要**
- Cloudflare Tunnel再起動: **不要**
