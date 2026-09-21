# Bannerfall Phase 3.9.4 — Recall, Recovery & Respawn Reservation

Phase 3.9.3 の Room Browser / Battle Statistics / Morale / 9兵科 / Reinforcement Wave を維持しつつ、テストプレイで見つかった操作・復帰まわりの不具合とUXを修正した版です。

## Phase 3.9.4 変更内容

### Copy Invite 修正

- `COPY INVITE` が **Room Codeを明示的に含むテキスト**をクリップボードへコピーするようになりました。
- コピー内容は `Bannerfall Room: ABC123` + 招待URLです。
- Clipboard API が使えない環境向けにフォールバックコピーも追加しています。
- 成功時はボタンに `COPIED ABC123` と表示します。

### B — Recall

- 戦闘中に `B` を押すと **4秒のRecall** を開始します。
- Recall完了時、生存している兵士ごと自軍のリスポーン地点へ戻ります。
- 移動、攻撃、Morale shock、ROUT / CHARGE / MELEE / BANNER ATTACK でRecallは中断されます。
- Recall中はHUDに残り時間を表示します。

### リスポーン地点で部隊を補充

- 自軍のリスポーン地点付近で一定時間（標準6秒）安全に待機すると、部隊を再補充できます。
- 回復対象は **兵数 + Morale** です。
- 途中で離れる、戦闘状態になる、Morale shockを受けるとカウントはリセットされます。
- Recall後、そのまま待機すれば補充へ移行できます。

### Spaceキー変更

- `Space` から突撃操作を削除しました。
- 突撃は **右クリック長押し → 離す** のみです。
- `Space` は **プレイヤー部隊へのカメラ追従復帰** に変更しました。
- ミニマップをクリックしてFree Cameraにした後、Spaceで即座に自部隊へ戻れます。

### 次回兵科の予約

- 生存中でも左下の `NEXT CLASS` ボタン、または `N` から **次回リスポーン兵科を予約**できます。
- 予約画面のカードをクリックすると予約確定です。
- 部隊全滅後も従来どおり1〜9またはカードから変更できます。
- リスポーンした時点で予約は消費されます。

### 即時リスポーン対策

Reinforcement Wave終了直前に全滅すると、ほぼ即時に復活してしまうケースを修正しました。

- Wave残り時間が短すぎる状態で全滅した部隊は、そのWaveへ滑り込みません。
- 次の完全なReinforcement Waveへ回されます。
- これにより「全滅直後に即復活」が起こりにくくなります。

### ミニマップ透明度

- ミニマップ上部に `MAP OPACITY` スライダーを追加しました。
- **20%〜100%** の範囲で調整できます。
- 設定はブラウザのLocal Storageへ保存され、次回起動時も維持されます。
- ミニマップのクリック移動機能はそのまま利用できます。

## 開発 / 本番サーバーのPORT分離

サーバーは環境変数 `PORT` を利用できます。未指定時は従来どおり `8787` です。

本番:

```powershell
npm run start
```

開発:

```powershell
$env:PORT=8788
npm run start
```

`HOST` も未指定時は `127.0.0.1` です。

## Controls

- `WASD` — 部隊移動
- `LMB` — 射撃 / 砲撃
- `RMB Hold → Release` — 突撃
- `1 / 2 / 3` — 歩兵装備
- `F` — 再整列 / 離脱
- `B` — Recall
- `N` — 次回兵科予約を開く / 閉じる
- `Space` — プレイヤーへのカメラ追従復帰
- `Middle Mouse Drag` — Free Camera
- `Mouse Wheel` — Zoom
- `Minimap Click` — カメラジャンプ
- `Tab` — Battle Statistics
- `Enter` — Chat
- `F3` — AI Debug

## 更新方法

`.github/workflows/deploy.yml` の変更は**不要**です。

開発環境ではZIPの中身を `develop` 側Cloneへ上書きし、Commit / Pushしてください。

共有ゲームロジックと `server/` を変更しているため、開発Serverは再起動が必要です。

```powershell
cd <bannerfall-dev>\server
$env:PORT=8788
npm run start
```

Cloudflare Tunnelがすでに `127.0.0.1:8788` を参照している場合、Tunnel側の再起動は不要です。

Health checkで `version: "3.9.4"` を確認してください。
