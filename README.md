# Bannerfall Phase 3.7.1 — Network Smoothing

Phase 3.7 Multiplayer Foundationをベースに、ネットワーク同期時の見た目を滑らかにした修正版です。

## 今回の変更

- 10Hzのサーバースナップショットをそのまま瞬間反映せず、クライアント側で位置を連続補正
- 部隊中心位置を指数補間
- 各兵士の位置を指数補間
- 部隊・兵士の向きも最短角度で補間
- ローカルプレイヤー部隊は少し弱めの補正にし、操作感を残しながらサーバー状態へ収束
- リスポーンや兵科変更など大きな位置変化は補間せず即座に同期
- カメラは補正後のプレイヤー部隊を追従するため、同期時の画面揺れを軽減
- 戦闘中の上部バーへ `TITLE` ボタンを追加
- `TITLE` を押すとRoomから退出し、部隊はAIへ引き継がれてタイトル画面へ戻る
- 再度試合へ入った際に入力イベントが二重登録されないようInputManagerを破棄可能に変更
- 砲兵の画面上部に表示されていた `ARTILLERY DEPLOYING` 表示を削除
- 砲兵の展開進捗はHotbar側のバーで確認
- メニューエラー表示を全メニュー画面で見える位置へ修正

## ネットワークスムージングの考え方

サーバーは20Hzでゲームをシミュレーションし、10Hzでスナップショットを送信します。
クライアント描画は通常60fps以上なので、スナップショットを直接座標へ代入すると約0.1秒ごとに位置が飛び、ユニットが小刻みに見えます。

Phase 3.7.1では：

```text
Authoritative Snapshot
        ↓
Network Target Position
        ↓
毎描画フレームで補間
        ↓
Displayed Position
```

という形にしています。

位置差が非常に大きい場合（リスポーンなど）は、長距離を滑って見えないよう即座に新しい座標へ切り替えます。

## TITLEボタン

戦闘画面右上の `TITLE` を押すと：

1. 現在のMultiplayerBattleを停止
2. Serverへ `leave_room` を送信
3. プレイヤーが担当していた部隊をAIへ返却
4. タイトル画面へ戻る

シングルプレイで自分しかRoomにいない場合、Roomはサーバー側で閉じられます。

## GitHub Pages

`.github/workflows/deploy.yml` は **変更不要** です。

このZIPの中身をGitHub Desktopでcloneした `bannerfall-testplay` のルートへ上書きしてください。

```text
bannerfall-testplay/
├ src/
├ server/
├ index.html
├ package.json
├ tsconfig.json
├ vite.config.ts
└ README.md
```

その後GitHub Desktopで：

```text
Changes確認
→ Commit to main
→ Push origin
```

## 自宅サーバー

サーバー側ゲームルールには変更ありませんが、クライアントと同じリポジトリから起動してください。

```powershell
cd C:\GitHub\bannerfall-testplay\server
npm install
npm run start
```

別PowerShellで：

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

## 開発確認

TypeScript型チェック済みです。

```powershell
npm run build
```

この実行環境ではVite本体が未インストールのため `tsc -b` まで確認しています。GitHub Actions側では従来どおり依存関係を取得してVite buildします。
