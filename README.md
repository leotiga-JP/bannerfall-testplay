# Bannerfall Version 4.0.6 — Artillery Range Display Hotfix

Version 4.0.6 は Version 4.0.5 を基準にした小規模UI Hotfixです。

- Game Version: `4.0.6`
- Protocol Version: `403`（変更なし）

## 変更内容

- プレイヤーが砲兵を操作しているとき、戦場上に砲撃可能距離を表示
  - 外側の実線リング: 最大射程
  - 内側の破線リング: 最低射程（この内側には射撃不可）
- Tactical Mapにも同じ最大/最低射程リングを表示
- HUDに数値で射程を表示
  - 例: `射程 480–6,300`
- 野戦砲兵・重砲兵・騎馬砲兵すべてに対応

## 適用

ZIPの中身を `bannerfall-testplay` へ上書きしてください。

- Server再起動: 推奨（GAME_VERSION表示を4.0.6へ揃えるため）
- `npm install`: 不要
- `deploy.yml`: 変更不要
- Protocol: `403` のまま
