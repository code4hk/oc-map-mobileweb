(function($) {

  'use strict';

  var KML_URL = 'http://limouren.appspot.com/map.kml';

  var GOOGLE_MAPS_URL_PREFIX = 'https://www.google.com/maps/place/';

  var BLACKLIST_EXTENDED_DATA_NAMES = [
    '\u72C0\u6CC1', // 狀況
    'Category',
    'Longitude',
    'Latitude'
  ];

  var FOLDER_SELECT_EL = $('<select id="folder-select"/>'),
      FOLDER_EL = $('<h2 class="folder-name"/><ul class="placemark-list"/>'),
      PLACEMARK_EL = $('<li><span class="name"/> <a class="map-link" target="_blank"></a><ul class="placemark"/></li>'),
      EXTENDED_DATA_ITEM_EL = $('<li><span class="value-span"></span></li>');

  var FOLDER_DICT;

  var FolderSelectContainer,
      FolderSelect,
      FolderContainer;

  function fetchKML() {
    return $.get(KML_URL);
  }

  function deriveGoogleMapsUrl(coord) {
    var coordStr = coord[1] + ',' + coord[0];
    return GOOGLE_MAPS_URL_PREFIX + coordStr + '/@' + coord[1] + ',' + coord[0] + ',17z';
  }

  function parsePolygonCoordinates(coordinates) {
    var n = coordinates.length / 3,
        coords = [];
    for (var i = 0; i < n; ++i) {
      coords.push([coordinates[i*3], coordinates[i*3 + 1], coordinates[i*3 + 2]]);
    }

    return coords;
  }

  function polygonArea(coords) {
    var sum = 0;
    for (var i = 0; i < coords.length - 1; ++i) {
      sum += coords[i][0]*coords[i+1][1];
      sum -= coords[i+1][0]*coords[i][1];
    }

    return sum/2;
  }

  function polygonCenteriod(coords) {
    var area = polygonArea(coords),
        cx = 0,
        cy = 0;

    for (var i = 0; i < coords.length - 1; ++i) {
      var xi = coords[i][0],
          yi = coords[i][1],
          xii = coords[i+1][0],
          yii = coords[i+1][1];
      cx += (xi + xii)*(xi*yii - xii*yi);
      cy += (yi + yii)*(xi*yii - xii*yi);
    }

    var centroid = [cx/(6*area), cy/(6*area), 0.0];
    return centroid;
  }

  function parseData(data) {
    var json = {},
        name = data.attr('name'),
        value = data.find('>value').text();

    json.name = name;
    json.value = value;

    return json;
  }

  function parseExtendedData(data) {
    var json = {},
        datas = data.find('>Data');

    $.each(datas, function(i, data) {
      var d = parseData($(data));
      json[d.name] = d.value;
    });

    return json;
  }

  function parsePolygon(polygon) {
    var json = {},
        coordinatesText = polygon.find('>outerBoundaryIs>LinearRing>coordinates').text(),
        coordinatesTextList = coordinatesText.split(' ');

    var coordinatesList = $.map(coordinatesTextList, function(coordText) {
      return JSON.parse('[' + coordText + ']');
    });
    var coords = parsePolygonCoordinates(coordinatesList);
    json.coordinates = polygonCenteriod(coords);

    return json;
  }

  function parsePoint(point) {
    var json = {},
        coordinatesText = point.find('>coordinates').text(),
        coordinates = JSON.parse('[' + coordinatesText + ']');

    json.coordinates = coordinates;

    return json;
  }

  function parsePlacemark(placemark) {
    var json = {},
        nameText = placemark.find('>name').text(),
        extendedData = placemark.find('>ExtendedData'),
        point = placemark.find('>Point'),
        polygon = placemark.find('>Polygon');

    json.name = nameText;
    json.data = parseExtendedData(extendedData);

    if (point.length > 0) {
      json.point = parsePoint(point);
    } else if (polygon.length > 0) {
      json.point = parsePolygon(polygon);
    }

    return json;
  }

  function parseFolder(folder) {
    var json = {},
        nameText = folder.find('>name').text(),
        placemarks = folder.find('>Placemark');

    json.name = nameText;
    json.placemarks = [];

    $.each(placemarks, function(i, placemark) {
      var p = parsePlacemark($(placemark));
      json.placemarks.push(p)
    });

    return json;
  }

  function parseDocument(doc) {
    var json = {},
        name = doc.find('>name').text(),
        folders = doc.find('>Folder');

    json.name = name;
    json.folderDict = {};

    $.each(folders, function(i, folder) {
      var f = parseFolder($(folder));
      json.folderDict[f.name] = f;
    });

    return json;
  }

  function parseKMLAsJson(data) {
    var $kml = $(data),
        doc = $kml.find('kml>Document');

    return parseDocument(doc);
  }

  function parseKML(data) {
    var json = {};
    return $(data);
  }

  function renderExtendedDataItem(name, value) {
    var $el = EXTENDED_DATA_ITEM_EL.clone(),
        nameSpan = $el.find('.data-name'),
        valueSpan = $el.find('.value-span');

    valueSpan.text(value);

    return $el;
  }

  function renderExtendedData(data) {
    var $el = $();

    $.each(data, function(key, value) {
      if (key && value && $.inArray(key, BLACKLIST_EXTENDED_DATA_NAMES) !== -1) {
        $el.append(renderExtendedDataItem(key, value));
      }
    });

    return $el;
  }

  function renderPlacemark(placemark) {
    var $el = PLACEMARK_EL.clone(),
      placemarkList = $el.find('.placemark'),
      nameEl = $el.find('.name'),
      mapLinkAnchor = $el.find('.map-link');

    if (placemark.point) {
      mapLinkAnchor.attr('href', deriveGoogleMapsUrl(placemark.point.coordinates));
      mapLinkAnchor.text('(view in maps)');
    }

    nameEl.text(placemark.name);
    placemarkList.append(renderExtendedData(placemark.data));

    return $el;
  }

  function renderFolder(folder) {
    var $el = FOLDER_EL.clone(),
        nameEl = $el.filter('.folder-name'),
        placemarkList = $el.filter('.placemark-list');

    nameEl.text(folder.name);

    $.each(folder.placemarks, function(i, placemark) {
      var $itemEl = renderPlacemark(placemark);
      placemarkList.append($itemEl);
    });

    return $el;
  }

  function handleFolderSelectChanged() {
    var folderName = FolderSelect.val(),
        folder = FOLDER_DICT[folderName];

    if (folder) {
      var folderEl = renderFolder(folder);
      FolderContainer.empty();
      FolderContainer.append(folderEl);
    }
  }

  function renderFolderSelect() {
    var keys = [];
    for (var key in FOLDER_DICT) {
      keys.push(key);
    }

    var $el = FOLDER_SELECT_EL.clone();
    $.each(keys, function(i, key) {
      var keyEl = $('<option/>');
      keyEl.text(key);
      $el.append(keyEl);
    });

    return $el;
  }

  function renderDocument(doc) {
    FOLDER_DICT = doc.folderDict;

    FolderSelect = renderFolderSelect();
    FolderSelect.on('change', handleFolderSelectChanged);
    FolderSelectContainer.append(FolderSelect);

    var selectedFolderName = FolderSelect.val(),
        folder = FOLDER_DICT[selectedFolderName];

    if (folder) {
      var folderEl = renderFolder(folder);
      FolderContainer.append(folderEl);
    }
  }

  function init() {
    FolderSelectContainer = $('#folder-select-container');
    FolderContainer = $('#content>.folder');

    fetchKML().then(function(data) {
      var doc = parseKMLAsJson(data);
      renderDocument(doc);

      $(document.body).removeClass('loading');
    });
  }

  $(document).ready(init);

})(jQuery);