//Copyright (C) 2019

//This file is part of Lenovo IdeaPad goodies.

//Lenovo IdeaPad goodies is free software: you can redistribute it and/or modify
//it under the terms of the GNU General Public License as published by
//the Free Software Foundation, either version 3 of the License, or
//(at your option) any later version.

//Lenovo IdeaPad goodies is distributed in the hope that it will be useful,
//but WITHOUT ANY WARRANTY; without even the implied warranty of
//MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//GNU General Public License for more details.

//You should have received a copy of the GNU General Public License
//along with Lenovo IdeaPad goodies.  If not, see <http://www.gnu.org/licenses/>.

//Author: Laurento Frittella <laurento.frittella at gmail dot com>

const St = imports.gi.St;
const Config = imports.misc.config;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;

const PanelMenu = imports.ui.panelMenu;
const aggregateMenu = Main.panel.statusArea.aggregateMenu;
const powerIndicator = aggregateMenu._power.indicators;
const powerMenu = aggregateMenu._power.menu.firstMenuItem.menu;

let icon, item;
// MANUAL OVERRIDE
// to disable the auto-discovery more, just set the absolute device path here
// E.g.: "/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode"
let sys_conservation = null;


class BatteryConservationIndicator extends PanelMenu.SystemIndicator {
  constructor() {
    super();

    this._indicator = this._addIndicator();
    this._indicator.icon_name = "emoji-nature-symbolic";

    // Monitor the changes and show or hide the indicator accordingly.
    const fileM = Gio.file_new_for_path(sys_conservation);
    this._monitor = fileM.monitor(Gio.FileMonitorFlags.NONE, null);
    this._monitor.connect('changed', Lang.bind(this, this._syncStatus));
    //this._monitor.connect('changed', () => this._syncStatus);

    // Set the initial and proper indicator status.
    this._syncStatus();
  }

  _syncStatus() {
    const status = Shell.get_file_contents_utf8_sync(sys_conservation);
    (status.trim() == "1") ? this._indicator.show() : this._indicator.hide();
  }

  static _toggleConservationMode() {
    const status = Shell.get_file_contents_utf8_sync(sys_conservation);
    const new_status = (status.trim() == "1") ? "0" : "1";

    Util.spawnCommandLine(`/bin/sh -c 'echo ${new_status} | sudo tee ${sys_conservation} >/dev/null'`)
  }

  destroy() {
    this._indicator.destroy();
    this._monitor.cancel();
  }
}

function _auto_dev_discovery(search_path) {
  let mod_path = Gio.file_new_for_path(search_path);

  let walker = mod_path.enumerate_children(
    "standard::name",
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    null);

  let child = null;
  let found = null;
  while ((child = walker.next_file(null))) {
    if (child.get_is_symlink() && child.get_name().startsWith("VPC2004")) {
      // ideapad_device_ids[] from the kernel module ideapad_acpi.c
      found = _auto_dev_discovery(`${search_path}/${child.get_name()}`);
    } else if (child.get_name() == "conservation_mode") {
      log(`IdeaPad device FOUND at ${search_path}`);
      found = `${search_path}/${child.get_name()}`;
    }
    // Stop as soon as the device is found.
    if (found !== null) break;
  }

  return found;
}

function init() {
  let sysfs_path = "/sys/bus/platform/drivers/ideapad_acpi";

  if (sys_conservation === null) {
    sys_conservation = _auto_dev_discovery(sysfs_path);

    if (sys_conservation === null) {
      throw new Error("Battery conservation mode not available.");
    }
  }
}

function enable() {
  icon = new BatteryConservationIndicator();
  powerIndicator.add_child(icon.indicators);

  item = powerMenu.addAction(
    _("Toggle Conservation Mode"),
    BatteryConservationIndicator._toggleConservationMode);
}

function disable() {
  item.destroy();
  icon.destroy();
}
