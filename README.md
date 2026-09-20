# Bannerfall Phase 3.9.2 — Battle Statistics

Phase 3.9.1をベースに、マルチプレイ戦績のサーバー権威集計を追加した版です。

## 追加内容

- 各部隊の **KILLS / DEATHS / BANNER DMG** をサーバー側Gameで集計
- 左下のプレイヤーパネルへ自分の戦績を常時表示
- **Tab長押し**で人間プレイヤー全員のスコアボードを表示
- スコアボード：Player/Squad、Team、Class、Kills、Deaths、Banner Damage
- マスケット、白兵戦、騎兵ロードキル、砲撃のキルを攻撃元部隊へ帰属
- リスポーンや兵科変更をまたいでも同一部隊の戦績を維持
- 旗への斧ダメージも部隊別に累積

`deploy.yml` の変更は不要です。`server/` と共有ゲームロジックを変更しているため、更新後はBannerfall Serverを再起動してください。

---

# Bannerfall Phase 3.9.1 — Rout Movement Fix

Phase 3.8 のマルチプレイヤーロビー／出撃準備／チャットと、Phase 3.7.1 のネットワークスムージングを維持しつつ、**膠着した戦線が局地的な勝利から崩れて動くこと**を狙った版です。

## Phase 3.9.1 修正

- Morale崩壊でROUTした部隊は、部隊名/ゲージだけでなく生存兵士自身が後方へ退却します。
- 退却中の兵士は実体を持ったままなので、射撃・砲撃・追撃の対象になり続けます。
- ROUT中は兵士・騎兵・砲兵・部隊名・Moraleバーをグレー表示し、戦意崩壊状態を即座に判別できます。
- 士気が回復してRALLYへ移行すると、退却先で再整列して通常色へ戻ります。


## Phase 3.9 の主な変更

### Morale / ROUT / 再集結

各部隊に Morale（士気）を追加しました。

- 銃撃・白兵戦・砲撃・騎兵突撃で士気が低下
- 短時間の損害、味方部隊の壊滅でも士気ショック
- 士気が低下すると `SHAKEN`
- 士気が限界まで下がると `ROUT` し、自軍後方へ強制退却
- 十分に後退して士気を回復すると再整列して戦線へ復帰
- 敵が ROUT した地点では AI が `BREAKTHROUGH` を選び、突破を前進へ変換
- フッサーは殺傷よりも士気破壊に強い Shock Cavalry
- 重砲兵は非常に大きな士気ダメージを与える

F3 の AI デバッグ表示や部隊名表示では、`SHAKEN` / `ROUT` と Morale を確認できます。

### 援軍ウェーブ

従来の「部隊ごとに死亡からN秒後に復活」から、**陣営ごとの Reinforcement Wave** に変更しました。

同じウェーブまでに全滅した部隊はまとめて後方キャンプから再出撃します。これにより、敵を複数部隊撃破した直後に「次の援軍が来るまで押し込める時間」が発生します。

Room の `RESPAWN` 設定値が、そのまま援軍ウェーブの基本間隔になります。

## 兵科

Phase 3.9 では9兵科です。

| 兵科 | 人数 | 主な役割 |
| --- | ---: | --- |
| Line Infantry | 20 | 標準戦列・Musket / Bayonet / Axe・旗破壊 |
| Light Infantry | 15 | 高機動・散開射撃・側面牽制・旗破壊 |
| Grenadiers | 16 | 高Morale・強近接・正面突破・旗破壊 |
| Dragoons | 14 | 高速移動＋射撃。Charge不可の機動火力 |
| Cavalry | 12 | 長距離Charge・Roadkill・砲兵狩り |
| Hussars | 10 | 高速Shock Charge・大Moraleダメージ・追撃 |
| Field Artillery | 6 | **2門**・長射程・標準的な継続砲撃 |
| Heavy Artillery | 7 | **1門**・超高火力・巨大爆発・長い展開/Reload |
| Horse Artillery | 6 | **3門**・小口径・高速移動/展開・前線追従 |

歩兵系3種だけが Axe で Banner を破壊できます。

### 砲兵の差

- **Field Artillery**: 2門。射程・火力・リロードの基準。
- **Heavy Artillery**: 1門。最大射程と最大爆発半径、高い物理／Moraleダメージ。その代わり非常に遅い。
- **Horse Artillery**: 3門。小さい爆発と低めの一発火力だが、展開・再装填・移動が速い。

## AI の兵科選択

AIは全滅して援軍ウェーブを待つ際、次の兵科を固定ではなく Utility 評価で選びます。

主な判断材料:

- 現在の味方兵科構成
- すでに次ウェーブで選択予定の兵科
- 敵の歩兵／騎兵／砲兵構成
- 敵軍・味方軍の平均Morale
- 自軍Bannerの危険度
- 敵Banner付近まで味方が進出しているか
- 各AI部隊の aggression / caution / flank preference
- 兵科ごとの Soft Cap

例:

- 敵砲兵が多い → Cavalry / Hussars 評価アップ
- 敵Moraleが崩れている → Hussars / Grenadiers 評価アップ
- 敵歩兵が多い → Artillery系評価アップ
- 自軍旗が危険 → Infantry / Grenadiers / Dragoons 評価アップ
- 敵旗が瀕死 → Axeを持てる歩兵系評価アップ

## プレイヤーの兵科選択

ロビーの `STARTING FORMATION` から9兵科をクリックして選択できます。

部隊全滅後はカードクリック、または `1〜9` で次の援軍ウェーブの兵科を選べます。

戦闘中の歩兵装備選択は従来どおり `1 / 2 / 3` です。

## マルチプレイ

Phase 3.8 の機能を維持しています。

- Room Code / Password
- 1〜50部隊 vs 1〜50部隊
- 出撃地点の早い者勝ち予約
- READY → Host START
- 3秒カウントダウン
- Room Chat / Battle Chat
- 人間が使わない部隊はAI
- 切断時はAIが部隊を引き継ぐ
- サーバー権威型20Hz + Snapshot 10Hz + クライアント補間

## 更新方法

既存の `.github/workflows/deploy.yml` は**変更不要**です。

ZIPの中身をローカルリポジトリ直下へ上書きし、GitHub Desktopで Commit / Pushしてください。

Phase 3.9 は `server/` と共有ゲームロジックも変更しているため、Push後にBannerfall Serverを再起動してください。

```powershell
cd C:\GitHub\bannerfall-testplay\server
npm run start
```

Cloudflare Tunnel は同じ `127.0.0.1:8787` を参照しているなら再起動不要です。

Health check:

```text
http://127.0.0.1:8787/health
```

`version: "3.9.1"` が表示されれば新サーバーです。
