import Map "mo:core/Map";

module {
  public type Day = Nat;

  public type Upgrade = { #pick; #bag; #lamp; #detector };

  public type Profile = {
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
    var streakDay : Day;
    var tier : Nat;
    var tierCheckedAt : Int;
  };

  public type ProfileView = {
    name : ?Text;
    coins : Nat;
    pick : Nat;
    bag : Nat;
    lamp : Nat;
    detector : Nat;
    album : [Nat];
    bestDay : Nat;
    totalScore : Nat;
    shifts : Nat;
    streak : Nat;
    tier : Nat;
  };

  public type ShiftResult = {
    score : Nat;
    gems : Nat;
    maxDepth : Nat;
    counts : [Nat];
    newBest : Bool;
    rank : Nat;
  };

  public type Shift = {
    day : Day;
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

  public type ShiftView = {
    day : Day;
    seed : Nat;
    energy : Nat;
    pick : Nat;
    bag : Nat;
    lamp : Nat;
    detector : Nat;
    tier : Nat;
    maxBiome : Nat;
    streak : Nat;
    verified : Bool;
    rushClaims : [Nat];
    result : ?ShiftResult;
    endsAt : Int;
  };

  public type DayEntry = {
    score : Nat;
    gems : Nat;
    maxDepth : Nat;
    at : Int;
  };

  public type DayStats = { var gems : Nat; var blocks : Nat; var players : Nat };

  public type MarketState = {
    var seen : Bool;
    var trackedDay : Nat;
    var lastHeight : Nat;
    var lastBlockAt : Int;
    var rushUntil : Int;
    var rushId : Nat;
  };

  public type StartError = {
    #anonymous;
    #busy;
    #ledgerUnavailable : Text;
  };

  public type SubmitError = {
    #anonymous;
    #noShift;
    #alreadySubmitted;
    #expired;
    #tooLong : Nat;
    #invalidMove : Nat;
  };

  public type RushError = {
    #anonymous;
    #noRush;
    #noShift;
    #alreadyClaimed;
    #shiftOver;
  };

  public type RecheckError = {
    #anonymous;
    #noShift;
    #tooSoon : { retryAfterSeconds : Nat };
    #ledgerUnavailable : Text;
  };

  public type ShopError = {
    #anonymous;
    #maxed;
    #notEnoughCoins : { cost : Nat; coins : Nat };
  };

  public type NameError = {
    #anonymous;
    #invalid : Text;
  };

  public type AdminError = {
    #notController;
    #unknownTier : Nat;
  };

  public type DayRow = {
    rank : Nat;
    player : Principal;
    name : ?Text;
    score : Nat;
    gems : Nat;
    maxDepth : Nat;
  };

  public type FameRow = {
    rank : Nat;
    player : Principal;
    name : ?Text;
    bestDay : Nat;
    totalScore : Nat;
    kinds : Nat;
  };

  public type Community = {
    day : Day;
    gemsToday : Nat;
    blocksToday : Nat;
    playersToday : Nat;
    rushUntil : Int;
    rushId : Nat;
    lastBlockAt : Int;
    now : Int;
  };

  public type GameConfig = {
    tierMinHolding : [Nat];
    baseEnergy : Nat;
    tierEnergy : Nat;
    rushEnergy : Nat;
    upgradeCosts : [Nat];
  };

  public type Profiles = Map.Map<Principal, Profile>;
  public type Shifts = Map.Map<Principal, Shift>;
  public type Seeds = Map.Map<Day, Nat32>;
  public type DayBoards = Map.Map<Day, Map.Map<Principal, DayEntry>>;
  public type Stats = Map.Map<Day, DayStats>;
  public type Names = Map.Map<Principal, Text>;
  public type Thresholds = Map.Map<Nat, Nat>;
};
