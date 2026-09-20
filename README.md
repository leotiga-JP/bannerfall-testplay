# Bannerfall — Phase 3.6 Long Range Artillery

Phase 3.5 Combined Arms をベースに、砲兵を本当の後方支援兵科として機能させるリワーク版です。

## この版の主な変更

- Artillery の最大射程を `1750 → 5250` に約3倍化
- Artillery の理想交戦距離を `3900` に変更
- 砲弾速度を上げ、遠距離射撃の待ち時間を調整
- AI砲兵は最寄りの敵ではなく、戦場全体から「歩兵密集・複数部隊の集中・旗攻撃中の敵」を優先して照準
- Musket の再装填進捗を Hotbar のアイテム下部バーで表示
- Artillery は未展開時に展開進捗、展開後は再装填進捗を同じ Hotbar バーで表示
- リスポーン時の兵科カードをマウスクリックで選択可能
- `1 / 2 / 3` のキーボード選択も維持

## Artillery

- 6兵
- 移動を止めると約2.3秒で展開
- 展開完了後に左クリック地点へ砲撃
- 最大射程: 5250
- 最小射程: 300
- プレイヤー再装填: 約6.7秒
- AIは遠距離の密集歩兵を優先して砲撃
- 騎兵が接近すると退避を試みる
- 近接戦闘には非常に弱い

通常カメラの外も射程に入ります。ミニマップをクリックしてFREE CAMERAへ移動し、遠方の地点を左クリックすることで、プレイヤー砲兵も画面外の戦場へ砲撃できます。`C`で自部隊へ戻れます。

## Hotbar の進捗バー

### Line Infantry

Musketスロット下部のバーが再装填進捗を示します。満タンで射撃可能です。

### Artillery

Cannonスロット下部のバーは状態に応じて変化します。

1. 移動停止後: 展開進捗
2. 展開完了: READY
3. 砲撃後: 再装填進捗
4. 満タン: 再射撃可能

## リスポーン時兵科選択

プレイヤー部隊全滅時に中央へ兵科選択画面が表示されます。

- Line Infantry
- Cavalry
- Artillery

カードをクリックして選択できます。従来通り `1 / 2 / 3` でも選択可能です。現在の軍構成と `RECOMMENDED` 兵科も表示されます。

## 既存仕様

- 20部隊 vs 20部隊
- Line Infantry / Cavalry / Artillery
- 敵Banner破壊で勝利
- 後方Reinforcement Campから部隊単位リスポーン
- InfantryのみAxeでBanner破壊可能
- Cavalryの長距離Charge / Roadkill
- Minimapクリックによるカメラ移動
- `C` でプレイヤー追尾へ復帰
- `F3` AIデバッグ
- `Z / X / V` で0.5x / 1x / 2x

## GitHub Pages

既存の `.github/workflows/deploy.yml` は変更不要です。今回のZIPには `.github` を含めていません。リポジトリ本体を上書きしてpushしてください。
