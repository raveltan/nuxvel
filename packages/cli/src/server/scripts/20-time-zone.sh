case "$(readlink /etc/localtime)" in
  */zoneinfo/Etc/UTC | */zoneinfo/UTC) ;;
  *) change "set the time zone to UTC" ln -sf /usr/share/zoneinfo/Etc/UTC /etc/localtime ;;
esac
