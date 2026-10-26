import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Types "../types";

module {
  // ASCII only, so names can't impersonate others with look-alike or right-to-left characters.
  public func clean(raw : Text) : Result.Result<Text, Text> {
    let name = raw.trim(#char ' ');
    let size = name.size();
    if (size < 3 or size > 16) return #err("Use 3 to 16 characters.");
    for (c in name.toIter()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_' or c == '-' or c == ' ';
      if (not ok) return #err("Use letters, digits, spaces, _ or - only.");
    };
    #ok(name);
  };

  public func set(names : Types.Names, player : Principal, name : Text) {
    names.add(player, name);
  };
};
