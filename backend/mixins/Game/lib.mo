import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Nat32 "mo:core/Nat32";
import Nat8 "mo:core/Nat8";
import Order "mo:core/Order";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../../types";
import Names "../../lib/Names";
import Sim "../../lib/Sim";

mixin (
  profiles : Types.Profiles,
  shifts : Types.Shifts,
  seeds : Types.Seeds,
  boards : Types.DayBoards,
  dayStats : Types.Stats,
  names : Types.Names,
  thresholds : Types.Thresholds,
  market : Types.MarketState,
) {
  transient let ledger = actor ("bi47f-2yaaa-aaaai-rayvq-cai") : actor {
    icrc1_balance_of : shared query ({ owner : Principal; subaccount : ?Blob }) -> async Nat;
  };
  transient let soonMarket = actor ("bp5zr-xaaaa-aaaai-rayva-cai") : actor {
    info : shared query () -> async { height : Nat64; last_block_at : Nat64 };
  };
  transient let management = actor ("aaaaa-aa") : actor {
    raw_rand : shared () -> async Blob;
  };
  transient let dayNanos : Int = 86_400_000_000_000;
  transient let checkCooldown : Int = 60_000_000_000;
  transient let maxMoves = 512;
  transient let marketPollGap : Int = 30_000_000_000;
  transient let rushDuration : Int = 900_000_000_000;
  transient let baseEnergy = 80;
  transient let tierEnergy = 20;
  transient let rushEnergy = 8;
  transient let defaultThresholds : [Nat] = [0, 100_000_000_000, 2_500_000_000_000, 10_000_000_000_000];
  transient let shopCosts : [Nat] = [0, 50, 100, 250, 500, 1_000];
  transient var lastPollAt : Int = 0;

  func today() : Nat = (Int.abs(Time.now()) / dayNanos.toNat());

  func ensureProfile(player : Principal) : Types.Profile {
    switch (profiles.get(player)) {
      case (?p) p;
      case null {
        let p : Types.Profile = {
          var coins = 0;
          var pick = 1;
          var bag = 1;
          var lamp = 1;
          var detector = 1;
          var album = [];
          var bestDay = 0;
          var totalScore = 0;
          var shifts = 0;
          var streak = 0;
          var streakDay = 0;
          var tier = 0;
          var tierCheckedAt = 0;
        };
        profiles.add(player, p);
        p;
      };
    };
  };

  func profileView(player : Principal, p : Types.Profile) : Types.ProfileView {
    {
      name = names.get(player);
      coins = p.coins;
      pick = p.pick;
      bag = p.bag;
      lamp = p.lamp;
      detector = p.detector;
      album = p.album;
      bestDay = p.bestDay;
      totalScore = p.totalScore;
      shifts = p.shifts;
      streak = p.streak;
      tier = p.tier;
    };
  };

  func tierFor(balance : Nat) : Nat {
    var tier = 0;
    var i = 1;
    while (i < defaultThresholds.size()) {
      if (balance >= (thresholds.get(i) ?? defaultThresholds[i])) tier := i;
      i += 1;
    };
    tier;
  };

  func maxBiome(tier : Nat) : Nat = Nat.min(4, 1 + tier);

  func balanceOf(player : Principal) : async ?Nat {
    try {
      ?(await (with timeout = 10) ledger.icrc1_balance_of({ owner = player; subaccount = null }))
    } catch (_) {
      null
    };
  };

  func seedFor(day : Nat) : async Nat32 {
    switch (seeds.get(day)) {
      case (?seed) seed;
      case null {
        let raw = await (with timeout = 10) management.raw_rand();
        let bytes = raw.toArray();
        var value = 0;
        var i = 0;
        while (i < 4) {
          value := value * 256 + bytes[i].toNat();
          i += 1;
        };
        let generated = value.toNat32();
        switch (seeds.get(day)) {
          case (?winner) winner;
          case null {
            seeds.add(day, generated);
            generated;
          };
        };
      };
    };
  };

  func toView(shift : Types.Shift) : Types.ShiftView {
    {
      day = shift.day;
      seed = shift.seed.toNat();
      energy = shift.energy;
      pick = shift.pick;
      bag = shift.bag;
      lamp = shift.lamp;
      detector = shift.detector;
      tier = shift.tier;
      maxBiome = shift.maxBiome;
      streak = shift.streak;
      verified = shift.verified;
      rushClaims = shift.rushClaims;
      result = shift.result;
      endsAt = (shift.day + 1) * dayNanos.toNat();
    };
  };

  func boardForDay(day : Nat) : Map.Map<Principal, Types.DayEntry> {
    switch (boards.get(day)) {
      case (?board) board;
      case null {
        let board = Map.empty<Principal, Types.DayEntry>();
        boards.add(day, board);
        board;
      };
    };
  };

  func statsFor(day : Nat) : Types.DayStats {
    switch (dayStats.get(day)) {
      case (?stats) stats;
      case null {
        let stats : Types.DayStats = { var gems = 0; var blocks = 0; var players = 0 };
        dayStats.add(day, stats);
        stats;
      };
    };
  };

  func communityView() : Types.Community {
    let day = today();
    let s = dayStats.get(day);
    {
      day;
      gemsToday = switch (s) { case (?v) v.gems; case null 0 };
      blocksToday = switch (s) { case (?v) v.blocks; case null 0 };
      playersToday = switch (s) { case (?v) v.players; case null 0 };
      rushUntil = market.rushUntil;
      rushId = market.rushId;
      lastBlockAt = market.lastBlockAt;
      now = Time.now();
    };
  };

  func rankOn(board : Map.Map<Principal, Types.DayEntry>, score : Nat, at : Int) : Nat {
    var rank = 1;
    for (entry in board.values()) {
      if (entry.score > score or (entry.score == score and entry.at < at)) rank += 1;
    };
    rank;
  };

  func countsOfKinds(album : [Nat]) : Nat {
    album.size();
  };

  func maybeInsertAlbum(p : Types.Profile, counts : [Nat]) {
    for ((count, kind) in counts.enumerate()) {
      if (count > 0 and not p.album.contains(kind)) p.album := p.album.concat([kind]);
    };
  };

  func upgradeLevel(p : Types.Profile, kind : Types.Upgrade) : Nat {
    switch (kind) {
      case (#pick) p.pick;
      case (#bag) p.bag;
      case (#lamp) p.lamp;
      case (#detector) p.detector;
    };
  };

  func setUpgradeLevel(p : Types.Profile, kind : Types.Upgrade, value : Nat) {
    switch (kind) {
      case (#pick) p.pick := value;
      case (#bag) p.bag := value;
      case (#lamp) p.lamp := value;
      case (#detector) p.detector := value;
    };
  };

  public query func config() : async Types.GameConfig {
    {
      tierMinHolding = [0, thresholds.get(1) ?? defaultThresholds[1], thresholds.get(2) ?? defaultThresholds[2], thresholds.get(3) ?? defaultThresholds[3]];
      baseEnergy;
      tierEnergy;
      rushEnergy;
      upgradeCosts = shopCosts;
    };
  };

  public shared ({ caller }) func startShift() : async Result.Result<Types.ShiftView, Types.StartError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    let day = today();
    switch (shifts.get(caller)) {
      case (?existing) {
        if (existing.day == day) return #ok(toView(existing));
      };
      case null {};
    };

    let p = ensureProfile(caller);
    let balanceResult = await balanceOf(caller);
    let verified = balanceResult != null;
    let balance = balanceResult ?? 0;
    let tier = if (verified) tierFor(balance) else 0;
    let now = Time.now();
    if (verified and p.streakDay != day) {
      p.streak := if (p.streakDay + 1 == day and p.tier > 0 and tier > 0) p.streak + 1 else if (tier > 0) 1 else 0;
      p.streakDay := day;
    };
    if (verified) {
      p.tier := tier;
      p.tierCheckedAt := now;
    };

    let seed = try { await seedFor(day) } catch (_) { return #err(#busy) };
    switch (shifts.get(caller)) {
      case (?existing) {
        if (existing.day == day) return #ok(toView(existing));
      };
      case null {};
    };

    let energy = baseEnergy + tier * tierEnergy + (if (p.streak >= 30) 20 else if (p.streak >= 7) 10 else if (p.streak >= 3) 5 else 0);
    let shift : Types.Shift = {
      day;
      seed;
      pick = p.pick;
      bag = p.bag;
      lamp = p.lamp;
      detector = p.detector;
      streak = if (verified) p.streak else 0;
      var energy;
      var tier;
      var maxBiome = maxBiome(tier);
      var verified;
      var rushClaims = [];
      var result = null;
    };
    shifts.add(caller, shift);
    #ok(toView(shift));
  };

  public query func myShift(player : Principal) : async ?Types.ShiftView {
    switch (shifts.get(player)) {
      case (?shift) { if (shift.day == today()) ?toView(shift) else null };
      case null null;
    };
  };

  public shared ({ caller }) func submitShift(moves : Blob) : async Result.Result<Types.ShiftResult, Types.SubmitError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    let shift = shifts.get(caller) ?? return #err(#noShift);
    if (shift.day != today()) return #err(#expired);
    if (shift.result != null) return #err(#alreadySubmitted);
    if (moves.size() > maxMoves) return #err(#tooLong(moves.size()));
    let checked = Sim.run(shift.seed, shift.pick, shift.bag, shift.maxBiome, shift.energy, moves);
    switch (checked) {
      case (#err(at)) #err(#invalidMove(at));
      case (#ok(run)) {
        let board = boardForDay(shift.day);
        let now = Time.now();
        let previous = board.get(caller);
        let newBest = switch (previous) { case (?entry) run.score > entry.score; case null true };
        let rank = rankOn(board, run.score, now);
        if (newBest) board.add(caller, { score = run.score; gems = run.gems; maxDepth = run.maxDepth; at = now });
        let s = statsFor(shift.day);
        s.gems += run.gems;
        if (previous == null) s.players += 1;
        let p = ensureProfile(caller);
        p.coins += run.score / 10 + run.gems * 2;
        p.totalScore += run.score;
        p.shifts += 1;
        if (run.score > p.bestDay) p.bestDay := run.score;
        maybeInsertAlbum(p, run.counts);
        let result : Types.ShiftResult = {
          score = run.score;
          gems = run.gems;
          maxDepth = run.maxDepth;
          counts = run.counts;
          newBest;
          rank;
        };
        shift.result := ?result;
        #ok(result);
      };
    };
  };

  public shared ({ caller }) func claimRush() : async Result.Result<Types.ShiftView, Types.RushError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    let shift = shifts.get(caller) ?? return #err(#noShift);
    if (shift.day != today()) return #err(#shiftOver);
    if (market.rushUntil <= Time.now()) return #err(#noRush);
    if (shift.rushClaims.contains(market.rushId)) return #err(#alreadyClaimed);
    shift.energy += rushEnergy;
    shift.rushClaims := shift.rushClaims.concat([market.rushId]);
    #ok(toView(shift));
  };

  public shared ({ caller }) func setName(raw : Text) : async Result.Result<Text, Types.NameError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    switch (Names.clean(raw)) {
      case (#err(reason)) #err(#invalid(reason));
      case (#ok(name)) {
        names.add(caller, name);
        #ok(name);
      };
    };
  };

  public shared ({ caller }) func buyUpgrade(kind : Types.Upgrade) : async Result.Result<Types.ProfileView, Types.ShopError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    let p = ensureProfile(caller);
    let level = upgradeLevel(p, kind);
    if (level >= 5) return #err(#maxed);
    let next = level + 1;
    let cost = shopCosts[next];
    if (p.coins < cost) return #err(#notEnoughCoins({ cost; coins = p.coins }));
    p.coins -= cost;
    setUpgradeLevel(p, kind, next);
    #ok(profileView(caller, p));
  };

  public shared ({ caller }) func recheckHolding() : async Result.Result<Types.ShiftView, Types.RecheckError> {
    if (caller.isAnonymous()) return #err(#anonymous);
    let shift = shifts.get(caller) ?? return #err(#noShift);
    if (shift.day != today()) return #err(#noShift);
    let p = ensureProfile(caller);
    let now = Time.now();
    let elapsed = now - p.tierCheckedAt;
    if (p.tierCheckedAt > 0 and elapsed < checkCooldown) {
      let remaining = Int.abs(checkCooldown - elapsed) / 1_000_000_000;
      return #err(#tooSoon({ retryAfterSeconds = remaining }));
    };
    let balance = switch (await balanceOf(caller)) {
      case (?v) v;
      case null return #err(#ledgerUnavailable("Could not read the RIGGY ledger."));
    };
    let oldTier = shift.tier;
    let nextTier = tierFor(balance);
    p.tier := nextTier;
    p.tierCheckedAt := now;
    if (nextTier > oldTier) shift.energy += (nextTier - oldTier) * tierEnergy;
    shift.tier := nextTier;
    shift.maxBiome := maxBiome(nextTier);
    shift.verified := true;
    #ok(toView(shift));
  };

  public shared ({ caller }) func setMinHolding(tier : Nat, e8s : Nat) : async Result.Result<(), Types.AdminError> {
    if (not caller.isController()) return #err(#notController);
    if (tier == 0 or tier >= defaultThresholds.size()) return #err(#unknownTier(tier));
    thresholds.add(tier, e8s);
    #ok;
  };

  public query func profile(player : Principal) : async ?Types.ProfileView {
    switch (profiles.get(player)) {
      case (?p) ?profileView(player, p);
      case null null;
    };
  };

  public query func dayBoard(day : ?Types.Day, limit : Nat) : async [Types.DayRow] {
    let targetDay = day ?? today();
    let ?board = boards.get(targetDay) else return [];
    let sorted = board.toArray().sort(func(a, b) {
      if (a.1.score > b.1.score) #less else if (a.1.score < b.1.score) #greater else Int.compare(a.1.at, b.1.at)
    });
    let n = Nat.min(Nat.min(limit, 100), sorted.size());
    sorted.sliceToArray(0, n.toInt()).mapEntries(func((player, entry), i) = ({
      rank = i + 1;
      player;
      name = names.get(player);
      score = entry.score;
      gems = entry.gems;
      maxDepth = entry.maxDepth;
    }));
  };

  public query func hallOfFame(limit : Nat) : async [Types.FameRow] {
    let sorted = profiles.toArray().sort(func(a, b) {
      if (a.1.totalScore > b.1.totalScore) #less else if (a.1.totalScore < b.1.totalScore) #greater else Principal.compare(a.0, b.0)
    });
    let n = Nat.min(Nat.min(limit, 100), sorted.size());
    sorted.sliceToArray(0, n.toInt()).mapEntries(func((player, p), i) = ({
      rank = i + 1;
      player;
      name = names.get(player);
      bestDay = p.bestDay;
      totalScore = p.totalScore;
      kinds = countsOfKinds(p.album);
    }));
  };

  public shared func refreshMarket() : async Types.Community {
    let now = Time.now();
    if (lastPollAt > 0 and now - lastPollAt < marketPollGap) return communityView();
    lastPollAt := now;
    try {
      let info = await (with timeout = 10) soonMarket.info();
      let height = info.height.toNat();
      let blockAt = info.last_block_at.toNat().toInt();
      let day = today();
      if (market.trackedDay != day) {
        market.trackedDay := day;
        statsFor(day).blocks := 0;
      };
      if (not market.seen) {
        market.seen := true;
      } else if (height > market.lastHeight) {
        statsFor(day).blocks += height - market.lastHeight;
        market.rushId += 1;
        market.rushUntil := now + rushDuration;
      };
      if (blockAt > market.lastBlockAt) market.lastBlockAt := blockAt;
      market.lastHeight := height;
    } catch (_) {};
    communityView();
  };

  public query func community() : async Types.Community {
    communityView();
  };
};
