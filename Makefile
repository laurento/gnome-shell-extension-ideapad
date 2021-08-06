all:	build install

build:
	xgettext --from-code=UTF-8 --output=po/ideapad.pot *.js
	gnome-extensions pack -f --podir=po . --out-dir=./

install:
	gnome-extensions install --force ./ideapad@laurento.frittella.shell-extension.zip
