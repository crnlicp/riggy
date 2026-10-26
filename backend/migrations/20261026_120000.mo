import Map "mo:core/Map";
import Nat "mo:core/Nat";

module {
  type Profile = {
    var coins : Nat;
    var pick : Nat;
    var bag : Nat;
    var lamp : Nat;
    var detector : Nat;
    var album : [Nat];
    var bestDay : Nat;
    var totalScore : Nat;
    var shifts : Nat;
    var streak : Nat;
    var streakDay : Nat;
    var tier : Nat;
    var tierCheckedAt : Int;
  };

  type ShiftResult = {
    score : Nat;
    gems : Nat;
    maxDepth : Nat;
    counts : [Nat];
    newBest : Bool;
    rank : Nat;
  };

  type Shift = {
    day : Nat;
    seed : Nat32;
    pick : Nat;
    bag : Nat;
    lamp : Nat;
    detector : Nat;
    streak : Nat;
    var energy : Nat;
    var tier : Nat;
    var maxBiome : Nat;
    var verified : Bool;
    var rushClaims : [Nat];
    var result : ?ShiftResult;
  };

  type DayEntry = { score : Nat; gems : Nat; maxDepth : Nat; at : Int };
  type DayStats = { var gems : Nat; var blocks : Nat; var players : Nat };
  type MarketState = { var seen : Bool; var trackedDay : Nat; var lastHeight : Nat; var lastBlockAt : Int; var rushUntil : Int; var rushId : Nat };

  type OldActor = {};
  type NewActor = {
    profiles : Map.Map<Principal, Profile>;
    shifts : Map.Map<Principal, Shift>;
    seeds : Map.Map<Nat, Nat32>;
    boards : Map.Map<Nat, Map.Map<Principal, DayEntry>>;
    dayStats : Map.Map<Nat, DayStats>;
    names : Map.Map<Principal, Text>;
    thresholds : Map.Map<Nat, Nat>;
    market : MarketState;
  };

  public func migration(_ : OldActor) : NewActor {
    let thresholds = Map.empty<Nat, Nat>();
    thresholds.add(1, 100_000_000_000);
    thresholds.add(2, 2_500_000_000_000);
    thresholds.add(3, 10_000_000_000_000);
    {
      profiles = Map.empty();
      shifts = Map.empty();
      seeds = Map.empty();
      boards = Map.empty();
      dayStats = Map.empty();
      names = Map.empty();
      thresholds;
      market = { var seen = false; var trackedDay = 0; var lastHeight = 0; var lastBlockAt = 0; var rushUntil = 0; var rushId = 0 };
    };
  };
};
