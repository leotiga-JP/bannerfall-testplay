# Bannerfall Version 4.4.5 — Universal Construction / Builder Entry Fix


## 4.4.5 変更点

- CONQUESTで建築許可がONなら、全兵科が `5` でBuilder Modeへ入れる。
- 工兵の建築/撤去時間は従来どおり1.5秒。
- 工兵以外の徒歩兵科・通常砲兵は3.0秒（2倍）。
- 騎兵・竜騎兵・騎馬砲兵など騎乗兵科は3.75秒（2.5倍）。
- Builder ModeのHotbar表示、設置Preview、Client入力、Server受付で残っていたengineer限定条件を統一して撤廃。
- 建築/撤去Progress BarはServer authoritativeな開始/完了時刻を使用するため、兵科別所要時間にそのまま追従する。
- Network schemaは変更していないためProtocolは444を維持。

Version 4.4.5 は 4.4.4 を基礎に、全兵科へConstructionを開放し、Builder Mode入口の表示・入力不具合を修正する更新です。
4.4.2のIntro高速化 / Musket Audio Fix、4.4.3の扉・道路・橋・AI建築は維持します。

- Game Version: `4.4.5`
- Protocol Version: `444`
- root package: `0.4.4-5`
- server package: `0.4.4-5`
- Client / Server は必ず同時に更新してください。

## Builder Mode UX

CONQUESTでRoom設定の「ブロック建築」がONなら、全兵科が `5` でBuilder Modeへ入ります。
Builder中は通常HotbarをBuilder専用Hotbarへ置き換えます。

- `1`: 戦闘モードへ戻る
- `2`: 木製壁
- `3`: 強化壁
- `4`: 銃眼
- `5`: 扉
- `6`: 道路
- `7`: 橋
- `R`: 90度回転
- 左クリック: 建築開始
- 味方Blockを右クリック: 撤去開始

建築・撤去はいずれも1.5秒です。作業中は画面下部に専用Progress Barと残り秒数を表示します。
ProgressはServer authoritativeな作業時刻をBattle Snapshotで同期するため、Clientの見かけだけ先に完成しません。

## Construction Navigation Stability

4.4.3ではA*の64pxセル判定とFormation中心のBlock collision幅が一致せず、A*上は通れる通路でも実移動がBlockされる場合がありました。4.4.4では次を修正しています。

- Formation中心のConstruction collision paddingをGrid通路と整合する8pxへ縮小
- 壁角に接触した場合、進行方向から±15/30/45/60/90度を試すwall-slide fallback
- A*の開始点/目的点をConstruction blocked cellから最寄りの通行可能Cellへ補正
- Waypoint到達判定を105pxから52pxへ縮小し、狭所でWaypointを飛ばしにくくした
- stuck判定を高速化し、約0.95秒でdetour/repath
- Construction近傍のAI Formationは自動的にCOLUMNへ変更し、抜けた後LINEへ復帰
- 自軍DoorはTeam別Navigation上、従来どおり通行可能

これにより壁の間・扉・1Grid程度の通路でAI Formationが停止し続けるケースを減らします。Soldier単位の完全なFormation reflowは引き続き今後のPolish対象です。

## Network

建築/撤去作業のServer authoritative Progress StateをBattle Snapshotへ追加したためProtocolを `443 → 444` へ更新しました。

## Room Setting

Room作成時に「ブロック建築」をON/OFFできます。
OFFの場合はPlayer / AIともConstructionを行いません。

## 馬防柵

旧Fieldwork（馬防柵）はGameplayから廃止しました。
`5`キーはBuilder Modeへ移行し、Fieldwork kit capacityは0になっています。
内部互換用の旧Fieldwork型は残っていますが、新規設置経路はありません。

## Construction Cost

- 木製壁: 木材45
- 強化壁: 木材20 / 鉄55 / 合金4
- 銃眼: 木材35 / 鉄18（合金不要）
- 扉: 木材42 / 鉄12
- 道路: 木材18
- 橋: 木材34

合金を要求するConstructionは強化壁のみです。

## Door

扉は壁系Blockとして射撃・砲撃を遮断します。
設置Teamの兵士は自動的に通過でき、敵Teamは通過できません。
AI NavigationもTeam別に扉を扱い、味方AIは自軍扉を通行可能、敵AIは障害物として扱います。

## Road / Bridge Tile

道路・橋は床Tile扱いで、Bullet / Cannonballの射線を遮りません。

- 道路: 木材のみ。上を通るFormationの移動速度を約18%強化。
- 橋: 木材のみ。River / Ford Cellに設置でき、水上の大きな速度Penaltyを実質的に解消。

## AI Construction

AIもTeam Stockpileを使用してConstructionを行います。

- AI工兵: 前方3Cellを中心とした簡易防壁
- AI砲兵: 前方と左右を覆う5Cellのコの字型防壁を優先
- Human-controlled Formation周囲ではAI建築を抑制し、Playerの移動・建築体験を邪魔しにくくする
- 建築にもPlayerと同じ1.5秒の作業時間を使用

## Formation Spacing

壁・扉・狭所でSoldier同士が詰まりにくくするため、全兵科の横方向Spacingを数px拡張しました。
高度な1 Grid突破口でのSoldier単位Formation Reflowは今後も継続調整対象です。

## Block Damage / Occlusion

4.4.2同様、木壁・強化壁・銃眼・扉はMusket / Sniper / Cannon / Explosion / Chargeの対象です。
敵BlockはMusket射撃でもDamageを受けます。
道路・橋は射線遮蔽物としては扱いません。
Mountain Occlusionも維持します。

## Intro / Musket Audio

4.4.2の修正を維持します。

- IntroのPan時間は旧4.4.1の約半分（カメラ移動速度約2倍）
- Volley音はPresentation Eventへ一本化
- 1 Volley EventにつきMusket MP3は1回のみ再生

## Network

建築/撤去作業のProgress StateをBattle Snapshotへ追加したためProtocolを `443 → 444` へ更新しました。
Construction stateは専用 `construction_state` で同期し、途中参加 / Reconnect時もFull Stateを復元します。

## 適用

- 上書き先: `bannerfall-dev/bannerfall-testplay`
- Server再起動: 必要
- npm install: 不要（既存依存関係に変更なし）
- deploy.yml変更: 不要
- Game Version: `4.4.4`
- Protocol Version: `444`
