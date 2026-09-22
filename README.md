# Bannerfall Version 4.0.4 — Navigation / Deployment Foundation

Version 4.0.4 は、Version 4.0.3 のテスト結果を受けた基盤更新です。山岳を避けるAI Navigation、3つのSpawn Area、途中参戦、再接続、Esc設定画面、移動速度とMorale復帰テンポの調整をまとめています。

## バージョン

- Game Version: `4.0.4`
- Protocol Version: `403`

途中参加・Spawn選択・Reconnect TokenなどNetwork Protocolを変更しているため、4.0.3 Serverとの混在はできません。

## AI Navigation

- 64px Grid Mapを使ったA*経路探索を実装
- Mountainは通行不能
- Road / Bridgeを優先
- Forest / Ford / Riverは兵科別の移動コストを設定
- 砲兵・騎兵は森林や水場を歩兵より強く避ける
- Mountain隣接タイルにもコストを付け、山肌への擦り付き移動を抑制
- 経路をキャッシュし、目的地変更・一定時間経過・スタック検出時のみ再探索
- AIはWEST / CENTER / EASTの3ルートを維持しつつ、実際の地形障害はA*で迂回
- Charge直線上にMountainがある場合はChargeを中止し、まず迂回
- FormationがMountain内部へ入った場合の救出処理も最終安全装置として維持

## 3 Spawn Area

各Teamに固定の3 Spawn Areaがあります。

- A 後方営地
- B 西部営地
- C 東部営地

Spawnは1点ではなく広いAreaとして扱い、Area内の複数Anchorへ分散配置されます。同一Waveで大量の部隊が一点へ完全重複しにくい構造です。

- Spawn Protectionなし
- Spawn Killはゲーム上許容
- Human / AIとも同じSpawn Area基盤を使用
- 死亡後は次回兵科とSpawn Areaを同時に予約可能
- 生存中も`N`から次回兵科 / Spawnを予約可能

## 途中参戦 / 再接続

### 新規途中参戦

Playing中Roomへ参加可能です。

1. Roomへ参加
2. BLUE / REDを自由に選択
3. 兵科を選択
4. Spawn A / B / Cを選択
5. `出撃`
6. そのTeamの空きAI Squad SlotをHumanへ割り当て、選択Spawnから新規出撃

PvE用途を考慮し、Teamの強制Auto Balanceは行いません。Human全員をBLUEへ配置し、REDをAIのみとする構成も可能です。

### 再接続

- Human切断時、そのFormationはAIが即時引き継ぎ
- ServerはReconnect TokenでFormationを120秒予約
- 同一ブラウザからRoomへ戻ると、元Formationへ復帰
- 兵数 / Morale / 位置 / Class / Reload / Statsは維持
- 意図的にRoomを退出した場合はReconnect予約を作成しません

## Esc設定

`Esc`で設定画面を開閉します。オンライン戦闘は停止しません。

- SE音量 0〜100%
- ミニマップ透明度 20〜100%
- ミニマップ位置: 左上 / 右下
- 設定値は`localStorage`へ保存
- 設定中はローカル操作入力を遮断し、Serverへ停止入力を送信

## UI

- Nキー兵科選択画面のカード左上にあった`1〜9 / CLICK`表示を完全削除
- 兵科予約はカードクリックに統一
- 次回Spawn Areaも同じ画面から選択可能
- 狙撃兵のHotbarに射撃Reload進行を表示
- フッサー表記を統一

## Balance / Battleflow

### 砲兵射程

Version 4.0.3から継続:

- 野戦砲兵: 7875
- 重砲兵: 6300
- 騎馬砲兵: 5325

### 移動速度

拡張マップで接敵までが長すぎたため全兵科を底上げしました。

- 戦列歩兵: 138 → 152
- 軽歩兵: 165 → 180
- 擲弾兵: 133 → 146
- 狙撃兵: 156 → 172
- 工兵: 163 → 179
- 竜騎兵: 198 → 214
- 騎兵: 218 → 235
- フッサー: 236 → 255
- 胸甲騎兵: 197 → 214
- 野戦砲兵: 92 → 118
- 重砲兵: 72 → 96
- 騎馬砲兵: 162 → 184

AI移動速度も同様に底上げしています。砲兵は依然として歩兵より遅いものの、広いマップでの移動ストレスを大幅に軽減しました。

### Morale / ROUT

操作不能時間を短縮しました。

- Reform Morale Threshold: 32 → 24
- Morale Shock Cooldown: 1.15s → 0.70s
- ROUT Recovery: 18/s → 32/s
- ROUT Distance: 420 → 240
- ROUT Speed Multiplier: 1.35 → 1.55
- Reform Soldier Catchup: 430 → 560

ROUT自体は残りますが、長時間何もできない時間を大幅に減らしています。

## 開発環境での起動

### Server

```powershell
cd C:\Users\leoti\ドキュメント\GitHub\bannerfall-dev\bannerfall-testplay\server
$env:PORT=8788
npm run start
```

確認:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/health | ConvertTo-Json -Depth 5
```

期待値:

```text
version         4.0.4
protocolVersion 403
```

### Client

```powershell
cd C:\Users\leoti\ドキュメント\GitHub\bannerfall-dev\bannerfall-testplay
npm run dev
```

### Tunnel

```powershell
cloudflared tunnel --url http://127.0.0.1:8788
```

## 重点テスト

1. AIがMountainへ直進し続けず、道路やゲートへ迂回する
2. BLUE / REDとも3つのLaneへ分散する
3. 砲兵が山岳地帯で停止せず、道路を優先して進む
4. 同じSpawn Areaから複数部隊をRespawnさせても一点へ完全重複しない
5. 死亡後にClass + Spawnを選択して次Waveから出撃できる
6. Playing中Roomへ新規参加し、Team / Class / Spawnを自由選択して出撃できる
7. 全Humanを片側Teamへ配置したPvE構成が成立する
8. 切断後120秒以内に同じFormationへReconnectできる
9. Esc設定中もServer側の戦闘が進行する
10. ミニマップを左上へ変更した後もクリック移動判定が表示位置と一致する
11. ROUTからの操作復帰が以前より大幅に短い
12. 特に砲兵の通常移動が4.0.3より快適になっている

## 適用方法

差分ZIPの中身を開発環境のプロジェクトルートへ上書きしてください。

- Server再起動: **必要**
- `npm install`: 不要
- Cloudflare Tunnel再起動: 不要（8788を向いていればそのまま）
- `deploy.yml`: 変更不要
