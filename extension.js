//Copyright (C) 2019 - 2022 Laurento Frittella

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

const ExtensionUtils = imports.misc.extensionUtils;
const { Gio, GObject, Shell, St } = imports.gi;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const Me = ExtensionUtils.getCurrentExtension();
const Util = imports.misc.util;

const QuickSettings = imports.ui.quickSettings;
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const Domain = Gettext.domain(Me.metadata['gettext-domain']);
const _ = Domain.gettext;

// MANUAL OVERRIDE
// to disable the auto-discovery more, just set the absolute device path here
// E.g.: "/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode"
let sys_conservation = null;


const ConservationToggle = GObject.registerClass(
class ConservationToggle extends QuickSettings.QuickToggle {
    _init(available = true) {
        super._init({
            label: _('Conservation Mode'),
            iconName: (available) ? 'emoji-nature-symbolic' : 'battery-level-0-symbolic',
            toggleMode: (available) ? true : false,
        });
    }
});

const ConservationIndicator = GObject.registerClass(
class ConservationIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();

        // Create the icon for the indicator
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'emoji-nature-symbolic';
        this._toggle = null;
        this._monitor = null;

        if (sys_conservation !== null) {
            // Create the toggle.
            this._toggle = new ConservationToggle();
            this._toggle.connect('clicked', item => {
                this._setConservationMode(item.get_checked());
            });

            // Monitor the changes and show or hide the indicator accordingly.
            const fileM = Gio.file_new_for_path(sys_conservation);
            this._monitor = fileM.monitor(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', this._syncStatus.bind(this));

            // Set the initial and proper indicator status.
            this._syncStatus();
        } else {
            // Use the toggle to signal the error.
            this._toggle = new ConservationToggle(false);
            this._indicator.visible = false;
        }

        // Make sure to destroy the toggle along with the indicator.
        this.connect('destroy', () => {
            this.quickSettingsItems.forEach(item => item.destroy());
            if (this._monitor !== null) this._monitor.cancel();
        });

        this.quickSettingsItems.push(this._toggle);
        // Add the indicator to the panel and the toggle to the menu.
        QuickSettingsMenu._indicators.add_child(this);
        QuickSettingsMenu._addItems(this.quickSettingsItems);
    }

    _syncStatus() {
        const status = Shell.get_file_contents_utf8_sync(sys_conservation);
        const active = (status.trim() == '1');
        this._indicator.visible = active;
        this._toggle.set_checked(active);
    }

    _setConservationMode(enabled) {
        const new_status = (enabled) ? '1' : '0';
        Util.spawnCommandLine(`/bin/sh -c 'echo ${new_status} | sudo tee ${sys_conservation} >/dev/null'`);
    }
});

class IdeaPadExtension {
    constructor() {
        this._indicator = null;
        ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
    }

    enable() {
        let sysfs_path = '/sys/bus/platform/drivers/ideapad_acpi';

        if (sys_conservation === null) {
            try {
                sys_conservation = this._auto_dev_discovery(sysfs_path);
                if (sys_conservation === null) {
                    throw new Error('Battery conservation mode not available.');
                }
                log(`Device found at: ${sys_conservation}`);
            } catch (e) {
                logError(e, Me.metadata.name);
            }
        }

        this._indicator = new ConservationIndicator();
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }

    _auto_dev_discovery(search_path) {
        let mod_path = Gio.file_new_for_path(search_path);

        let walker = mod_path.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null);

        let child = null;
        let found = null;
        while ((child = walker.next_file(null))) {
            if (child.get_is_symlink() && child.get_name().startsWith('VPC2004')) {
                // ideapad_device_ids[] from the kernel module ideapad_acpi.c
                found = this._auto_dev_discovery(`${search_path}/${child.get_name()}`);
            } else if (child.get_name() == 'conservation_mode') {
                found = `${search_path}/${child.get_name()}`;
            }
            // Stop as soon as the device is found.
            if (found !== null) break;
        }

        return found;
    }
}

function init() {
    return new IdeaPadExtension();
}
