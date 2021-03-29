# gnome-shell-extension-ideapad
Lenovo IdeaPad goodies for GNOME Shell

*At the moment the extension only provides an easy and user-friendly way to toggle the battery conservation mode available on Levono Ideapad laptops and visually get its current state.*

# Installation
Simply install the extension from the [official GNOME extensions website](https://extensions.gnome.org/extension/2992/ideapad/) (recommended). Alternatively, manually download or clone the repository under `~/.local/share/gnome-shell/extensions/ideapad@laurento.frittella`

In both cases, few additional steps are required. Please check the dedicate following section.

# Usage
The extension adds a new entry *Toggle Conservation Mode* to the panel and shows an icon on the status menu to indicate when the battery conservation mode is enabled.

If your particular laptop model supports it, the conservation mode limits battery charging to 55-60% of its capacity to improve battery life. It is particularly useful when the laptop runs on external power most of the time.

![](screenshot.png)

# Additional Required Settings
Your desktop user needs read-and-write access to a specific sysfs file that is normally owned by the root user. The easiest way to achieve that is using `sudo`. The following steps have been tested on Debian, but they should work on any modern GNU/Linux system. In case of doubts, please refer to your specific distribution documentation.

* Depending on your distro, you need to use the group `sudo` (e.g. Debian and Ubuntu) or `wheel` (e.g. Arch and Fedora) here. In case of doubt, run the command `groups` in a terminal and see which of the two is listed in the output.

  Add the following entry to your system sudoers configuration (e.g. `/etc/sudoers.d/ideapad`). **Make sure to replace** `%sudo` with `%wheel` if needed.
  ~~~
  %sudo ALL=(ALL) NOPASSWD: /usr/bin/tee /sys/bus/platform/drivers/ideapad_acpi/VPC????\:??/conservation_mode
  ~~~

* To make sure the `ideapad_laptop` kernel module gets loaded automatically at boot, simply add it to the file `/etc/modules`

To summarize and for easy reference...
~~~
# Don't forget to replace %sudo with %wheel if needed!
#
$ echo "%sudo ALL=(ALL) NOPASSWD: /usr/bin/tee /sys/bus/platform/drivers/ideapad_acpi/VPC????\:??/conservation_mode" | sudo tee /etc/sudoers.d/ideapad
$ echo "ideapad_laptop" | sudo tee -a /etc/modules
~~~

# Wrong battery estimation displayed
A very minor cosmetic issue does currently exist. However, if the wrong battery estimation displayed in GNOME bugs you, there is also a solution.

When battery conservation mode is enabled, uPower (at least v0.99.11) doesn't seem able to properly identify the battery status just after the charging stops at 60%. More in particular, looking at the relevant uPower source code, one can read `/* the battery isn't charging or discharging, it's just sitting there half full doing nothing: try to guess a state */`. Unfortunately, the guessing fails resulting in exotic battery charging time readings.

I've already reported the issue upstream; you can find [my proposed patch in the bug report](https://gitlab.freedesktop.org/upower/upower/-/issues/120). The patch essentially puts the conservation mode in the game and, when the battery stops charging, uPower simply understands the reason why.
