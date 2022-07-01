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
const ByteArray = imports.byteArray;
const Slider = imports.ui.slider;
const Me = ExtensionUtils.getCurrentExtension();
const Util = imports.misc.util;
const UPower = imports.gi.UPowerGlib;

const Domain = Gettext.domain(Me.metadata['gettext-domain']);
const _ = Domain.gettext;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const aggregateMenu = Main.panel.statusArea.aggregateMenu;
const powerIndicator = _getIndicators(aggregateMenu._power);
const powerMenu = powerIndicator.menu.firstMenuItem.menu;
const powerProxy = powerIndicator._proxy;

// MANUAL OVERRIDE
// to disable the auto-discovery more, just set the absolute device path here
// E.g.: "/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode"
let sys_conservation = null;

const conservation_level_min = 60;
const conservation_hysteresis = 2;

function getSettings () {
    let GioSSS = Gio.SettingsSchemaSource;
    let schemaSource = GioSSS.new_from_directory(
      Me.dir.get_child("schemas").get_path(),
      GioSSS.get_default(),
      false
    );
    let schemaObj = schemaSource.lookup(
      'org.gnome.shell.extensions.ideapad', true);
    if (!schemaObj) {
      throw new Error('cannot find schemas');
    }
    return new Gio.Settings({ settings_schema : schemaObj });
  }

const ConservationLevelSlider = GObject.registerClass(
    {
        GTypeName: 'ConservationLevelSlider'
    },
    class ConservationLevelSlider extends PopupMenu.PopupBaseMenuItem{
        _init(conservation_level){
            super._init({ activate: false })

            this.slider = new Slider.Slider(conservation_level / 100);
            this.slider.accessible_name = _('conservation level');
            this._slider_icon = new St.Icon({icon_name: 'emoji-nature-symbolic',
                style_class: 'popup-menu-icon'});

            this.label = new St.Label({text: ''});
            this.label.set_text(this.slider.value * 100 + "%")

            this.add(this._slider_icon);
            this.add_child(this.slider);
            this.add(this.label);

            // Connect menu signals to the slider
            this.connect('button-press-event', (actor, event) => {
                return this.slider.startDragging(event);
            });
            this.connect('key-press-event', (actor, event) => {
                return this.slider.emit('key-press-event', event);
            });
            this.connect('scroll-event', (actor, event) => {
                return this.slider.emit('scroll-event', event);
            });

            this.slider.connect('notify::value',
                this.onChange.bind(this));
        }

        onChange(actor, event){
            this.label.set_text(this.slider.value * 100 + "%")
            this.emit('notify::value', event);
        }

        getValue(){
            return  this.slider.value * 100;
        }

        setValue(v){
            v = Math.round(v);
            if (v <= conservation_level_min){
                v = conservation_level_min;
            }
            this.slider.value = v / 100;
            return v;
        }

        destroy(){
            this.slider.destroy();
            this.label.destroy();
            super.destroy()
        }
    }
)

const BatteryConservationIndicator = GObject.registerClass(
    {
        GTypeName: 'BatteryConservationIndicator'
    },
    class BatteryConservationIndicator extends PanelMenu.SystemIndicator {
        _init() {
            super._init();

            this.settings = getSettings();
            this.conservation_level = this.settings.get_int('conservation-level');
            this.enabled = this.settings.get_boolean('enabled');
            this.boost = this.settings.get_boolean('boost');

            this.file_handle = Gio.File.new_for_path(sys_conservation);

            this._indicator = this._addIndicator();
            this._indicator.icon_name = "emoji-nature-symbolic";
            powerIndicator.add_child(_getIndicators(this));

            if (sys_conservation !== null) {
                // AutoConservationMode button
                this.autoConservationModeItem = new PopupMenu.PopupSwitchMenuItem(
                    _("Auto Conservation Mode"), this.enabled);

                this.autoConservationModeItem.connect('toggled', item => {
                    this._setAutoConservationMode(item.state);
                });
                powerMenu.addMenuItem(this.autoConservationModeItem);

                // Boost mode button
                this.boostModeItem = new PopupMenu.PopupSwitchMenuItem(
                    _("Boost"), this.boost);

                this.boostModeItem.connect('toggled', item => {
                    this._setBoostMode(item.state);
                });
                powerMenu.addMenuItem(this.boostModeItem);

                // ConservationLevelSlider
                this.sliderMenuItem = new ConservationLevelSlider(this.conservation_level);
                this._sliderChangedId = this.sliderMenuItem.connect('notify::value',
                    this._sliderChanged.bind(this));
                powerMenu.addMenuItem(this.sliderMenuItem);

                this._power_change_handle = powerProxy.connect(
                    'g-properties-changed',
                    this.autoConservationMode.bind(this));
                this.autoConservationMode();

            } else {
                this.autoConservationModeItem = powerMenu.addAction(
                    _("Conservation mode is not available"),
                    function () {}
                );

                this._indicator.visible = false;
            }
        }

        _sliderChanged(){
            let value = this.sliderMenuItem.getValue();
            this.conservation_level = this.sliderMenuItem.setValue(value);
            this.settings.set_int('conservation-level', this.conservation_level);
            this.autoConservationMode()
        }

        autoConservationMode(){
            const state = powerProxy.State;
            const level = powerProxy.Percentage;

            log("autoConservationMode(), level=" + level);
            log("state: " + UPower.Device.state_to_string(state) + "(" + state+")" );
            log("conservation_level=" + this.conservation_level);
            log("enabled: " + this.enabled);
            log("boost: " + this.boost);

            if (this.boost){
                if (state == UPower.DeviceState.FULLY_CHARGED){
                    Main.notify('Charge complete', 'Boost charge is completed, the battery will be kept at 100% until disconnect');
                }

                if (state == UPower.DeviceState.DISCHARGING){
                    // end boost mode
                    this._setBoostMode(false, false);
                    Main.notify('Boost finished', 'Upon reconnect conservation mode will be activated')
                }
            }

            if (!this.enabled || this.boost) {
                this._setConservationMode(false);
                return;
            }
            if (this.conservation_level == 60){
                // always enable conservation mode when set to 60
                this._setConservationMode(true);
                return;
            }

            if (level >= this.conservation_level){
                this._setConservationMode(true);
                return;
            }

            if (level < this.conservation_level - conservation_hysteresis){
                this._setConservationMode(false);
                return;
            }
        }

        _syncStatus() {
            //
            const [, status, etag] = this.file_handle.load_contents(null);
            const active = (ByteArray.toString(status).trim() == "1");
            log("syncStatus: " + active)
            this._indicator.visible = active;
            this.autoConservationModeItem.setToggleState(this.enabled);
            this.boostModeItem.setToggleState(this.boost);
        }

        _setAutoConservationMode(enabled) {
            this.enabled = enabled;
            this.settings.set_boolean('enabled', enabled);
            this.autoConservationMode();
        }

        _setBoostMode(enabled, apply=true) {
            this.boost = enabled;
            this.settings.set_boolean('boost', enabled);
            if (apply){
                this.autoConservationMode();
            }
        }

        _setConservationMode(enabled) {
            const new_status = (enabled) ? "1" : "0";
            this.file_handle.replace_contents(new_status, null, false,
                Gio.FileCreateFlags.NONE, null)
            this._syncStatus();
        }

        destroy() {
            // On exit always set conservation mode if enabled and not boosting
            // Otherwise the battery may be fully charged when the laptop is locked
            this._setConservationMode(this.enabled && !this.boost);

            this._indicator.destroy();
            this.autoConservationModeItem.destroy();
            this.sliderMenuItem.destroy();
            this.boostModeItem.destroy();
            powerProxy.disconnect(this._power_change_handle);
        }
    }
);

function _getIndicators(delegate) {
    if (delegate instanceof St.BoxLayout) {
        return delegate;
    }

    return delegate.indicators;
}

function _auto_dev_discovery(search_path, child_name) {
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
            found = _auto_dev_discovery(`${search_path}/${child.get_name()}`, child_name);
        } else if (child.get_name() == child_name) {
            log(`IdeaPad device FOUND at ${search_path}`);
            found = `${search_path}/${child.get_name()}`;
        }
        // Stop as soon as the device is found.
        if (found !== null) break;
    }

    return found;
}

function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
}

let batteryConservationIndicator = null;

function set_permissions(path){
  Util.spawnCommandLine(`/bin/sh -c 'chgrp ideapad ${sys_conservation} >/dev/null && chown g+w ${sys_conservation} >/dev/null'`);
}

function enable() {
    let sysfs_path = "/sys/bus/platform/drivers/ideapad_acpi";

    if (sys_conservation === null) {
        try {
            sys_conservation = _auto_dev_discovery(sysfs_path, "conservation_mode");

            if (sys_conservation === null) {
                throw new Error("Battery conservation mode not available.");
            }
        } catch (e) {
            logError(e, "ideapad");
        }
    }
    batteryConservationIndicator = new BatteryConservationIndicator();
}

function disable() {
    batteryConservationIndicator.destroy();
    batteryConservationIndicator = null;
}
