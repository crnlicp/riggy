import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Set "mo:core/Set";

module {
  public type Outcome = {
    score : Nat;
    gems : Nat;
    maxDepth : Nat;
    counts : [Nat];
    hauledValue : Nat;
    energyLeft : Nat;
    moves : Nat;
  };

  type Tile = { kind : Nat; hardness : Nat; value : Nat; gem : Int };
  let width = 16;
  let rowsPerBiome = 100;
  let biomeCount = 5;
  let mod32 = 4_294_967_296;
  let moveRope = 4;
  let moveScan = 5;
  let empty : Tile = { kind = 0; hardness = 0; value = 0; gem = -1 };
  let gemValues : [Nat] = [4, 8, 14, 28, 34, 42, 80];
  let oreRanges : [Nat] = [90, 60, 40, 22, 18, 13, 7];
  let oreDepth : [Nat] = [160, 130, 100, 70, 55, 45, 30];
  let airLimits : [Nat] = [1250, 1105, 960, 815, 670];
  let oreOffsets : [Nat] = [11_750, 11_895, 12_040, 12_185, 12_330];

  func cellIndex(x : Nat, y : Nat) : Nat = y * width + x;

  func hashCell(seed : Nat32, x : Nat, y : Nat) : Nat {
    let a = (seed.toNat() * 1_664_525) % mod32;
    let b = (y * 1_013_904_223) % mod32;
    let c = (x * 747_796_405) % mod32;
    (a + b + c) % mod32;
  };

  func tileAt(seed : Nat32, x : Nat, y : Nat) : Tile {
    if (x >= width or y >= biomeCount * rowsPerBiome) return { kind = 11; hardness = 255; value = 0; gem = -1 };
    if (y == 0) return empty;
    let biome = y / rowsPerBiome;
    let roll = hashCell(seed, x, y) % 10_000;
    let airLimit = airLimits[biome];
    if (roll < airLimit) return empty;
    if (roll < airLimit + 4_450) return { kind = 1; hardness = 1; value = 0; gem = -1 };
    if (roll < airLimit + 7_000) {
      return { kind = 2; hardness = if (biome >= 3 and roll % 5 == 0) 3 else 2; value = 0; gem = -1 };
    };
    if (roll > 9_900 and biome > 0) return { kind = 10; hardness = 2 + Nat.min(2, biome); value = 0; gem = -1 };
    if (roll >= 9_800 and roll <= 9_900) return { kind = 12; hardness = 1; value = 2 + biome; gem = -1 };
    let oreRoll = (roll + oreOffsets[biome]) % 10_000;
    var threshold = 0;
    var i = 0;
    while (i < oreRanges.size()) {
      threshold += oreRanges[i] + biome * oreDepth[i];
      if (oreRoll < threshold) {
        return {
          kind = 3 + i;
          hardness = 1 + (i / 3) + (biome / 2);
          value = gemValues[i] * (biome + 1);
          gem = i.toInt();
        };
      };
      i += 1;
    };
    { kind = 2; hardness = if (biome >= 3) 3 else 2; value = 0; gem = -1 };
  };

  public func run(seed : Nat32, pick : Nat, bagLevel : Nat, maxBiome : Nat, initialEnergy : Nat, moves : Blob) : { #ok : Outcome; #err : Nat } {
    let actions = moves.toArray();
    if (actions.size() > 512) return #err(512);
    var x = width / 2;
    var y = 0;
    var maxDepth = 0;
    var energy = initialEnergy;
    let capacity = 2 + bagLevel * 6;
    var bagValue = 0;
    var bankedValue = 0;
    let bagGems = Map.empty<Nat, Nat>();
    let bankedGems = Map.empty<Nat, Nat>();
    let dug = Set.empty<Nat>();
    let brokenStones = Set.empty<Nat>();
    var banked = false;
    var ended = false;
    var invalid : ?Nat = null;
    var i = 0;

    while (i < actions.size() and invalid == null) {
      let move = actions[i].toNat();
      if (ended or move > moveScan) {
        invalid := ?i;
      } else if (move == moveScan) {
        if (energy < 2) {
          invalid := ?i;
        } else {
          energy -= 2;
          if (energy == 0) {
            bankedValue += bagValue / 2;
            bagValue := 0;
            for ((gem, count) in bagGems.entries()) bankedGems.add(gem, count);
            bagGems.clear();
            ended := true;
          };
        };
      } else if (move == moveRope) {
        if (energy == 0) {
          invalid := ?i;
        } else {
          energy -= 1;
          bankedValue += bagValue;
          bagValue := 0;
          for ((gem, count) in bagGems.entries()) bankedGems.add(gem, count);
          bagGems.clear();
          banked := true;
          ended := true;
        };
      } else if (energy == 0 or bagValue >= capacity) {
        invalid := ?i;
      } else {
        let dx : Int = if (move == 3) -1 else if (move == 1) 1 else 0;
        let dy : Int = if (move == 0) -1 else if (move == 2) 1 else 0;
        let nextX = x.toInt() + dx;
        let nextY = y.toInt() + dy;
        if (nextX < 0 or nextX >= width.toInt() or nextY < 0 or nextY >= ((Nat.min(maxBiome, biomeCount - 1) + 1) * rowsPerBiome).toInt()) {
          invalid := ?i;
        } else {
          let nx = nextX.toNat();
          let ny = nextY.toNat();
          let idx = cellIndex(nx, ny);
          let tile = if (brokenStones.contains(idx)) {
            { kind = 1; hardness = 1; value = 0; gem = -1 };
          } else tileAt(seed, nx, ny);
          if (tile.kind == 11) {
            invalid := ?i;
          } else if (tile.kind != 0 and not dug.contains(idx)) {
            let requiredPick = tile.hardness / 2 + tile.hardness % 2;
            if (pick < requiredPick) {
              invalid := ?i;
            } else if (energy < (if (tile.kind == 2 or tile.kind == 10) 2 else 1)) {
              invalid := ?i;
            } else {
              energy -= if (tile.kind == 2 or tile.kind == 10) 2 else 1;
              if (tile.kind == 2 or tile.kind == 10) {
                brokenStones.add(idx);
              } else {
                dug.add(idx);
                if (tile.value > 0 and bagValue + tile.value <= capacity) {
                  bagValue += tile.value;
                  if (tile.gem >= 0) {
                    let gem = tile.gem.toNat();
                    bagGems.add(gem, (bagGems.get(gem) ?? 0) + 1);
                  };
                };
                x := nx;
                y := ny;
              };
            };
          } else {
            energy -= 1;
            x := nx;
            y := ny;
          };
          if (invalid == null) {
            maxDepth := Nat.max(maxDepth, y);
            if (bagValue >= capacity or energy == 0) {
              bankedValue += bagValue / 2;
              bagValue := 0;
              for ((gem, count) in bagGems.entries()) bankedGems.add(gem, count);
              bagGems.clear();
              ended := true;
            };
          };
        };
      };
      i += 1;
    };

    if (invalid == null and not ended) invalid := ?actions.size();
    switch (invalid) {
      case (?at) #err(at);
      case null {
        let counts = Array.tabulate(7, func gem = bankedGems.get(gem) ?? 0);
        let gems = counts.foldLeft(0, func(total, n) = total + n);
        #ok({
          score = bankedValue + maxDepth * 2 + gems * 10;
          gems;
          maxDepth;
          counts;
          hauledValue = bankedValue;
          energyLeft = energy;
          moves = actions.size();
        });
      };
    };
  };
};
