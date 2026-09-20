# Bannerfall Phase 3.8 — Multiplayer Lobby & Deployment

Phase 3.7.1 のサーバー権威型マルチプレイとネットワークスムージングを維持し、試合前の出撃準備を追加した版です。

## Phase 3.8 の追加要素

- ロビーで開始兵科を選択
  - Line Infantry
  - Cavalry
  - Artillery
- ロビーの戦場図から出撃地点を選択
- 出撃地点はサーバー側で排他予約（早い者勝ち）
- チーム変更時は出撃地点予約を解除
- 兵科・出撃地点変更時は READY を解除
- 全プレイヤーが READY になったときだけホストが START 可能
- START 後 3 秒の共通カウントダウン
- ロビー / 戦闘で共通の Room Chat
- 戦闘中は Enter でチャット欄へフォーカス
- チャット入力中は WASD 等のゲーム入力を抑制
- 人間が選ばなかった部隊枠は従来通り AI が担当
- 切断したプレイヤー部隊は AI が引き継ぐ

## 出撃地点

各陣営の総部隊数と同数の出撃枠があります。

例: 20 vs 20 の場合、BLUE は B01〜B20、RED は R01〜R20。

プレイヤーが B07 を予約した場合、その試合では B07 が人間プレイヤー担当となり、それ以外の空き枠は AI が担当します。

## READY と開始

1. Team を選ぶ
2. Starting Formation を選ぶ
3. Deployment Point を選ぶ
4. READY
5. 全員 READY 後、Host が START BATTLE
6. 3 秒カウントダウン後に試合開始

READY 後に編成を変えたい場合は `CANCEL READY` を押してください。

## Chat

ロビーでは右側の Room Chat を使用します。

戦闘中は画面左下のチャット欄を使用します。

- `Enter`: 戦闘中チャットへフォーカス
- `Enter`: 送信
- `Esc`: チャット欄からフォーカス解除

## 自宅サーバー

Phase 3.8 では `server/` のコードも変更されています。更新後は Bannerfall Server を再起動してください。

```powershell
cd C:\GitHub\bannerfall-testplay\server
npm run start
```

Cloudflare Tunnel は同じ `127.0.0.1:8787` を参照している限り、原則そのまま利用できます。

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

Health check:

```text
http://127.0.0.1:8787/health
```

`version: "3.8"` が表示されれば新サーバーです。

## GitHub Pages

既存の `.github/workflows/deploy.yml` は変更不要です。Phase 3.8 ZIP の中身をローカルリポジトリ直下へ上書きして、GitHub Desktop から Commit / Push してください。
