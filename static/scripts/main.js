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

  var CATEGORY_CONVENIENT_STORE = '\u4FBF\u5229\u5E97';

  var ICON_STYLE_ID_RE = new RegExp('icon-.+');

  var FOLDER_SELECT_EL = $('<select id="folder-select"/>'),
      FOLDER_EL = $('<h2 class="folder-name"/><ul class="placemark-list"/>'),
      PLACEMARK_EL = $('<li><img class="placemark-icon" height="28"/> <span class="name"/> <span class="placemark-distance"/> <a class="map-link" target="_blank"></a><ul class="placemark"/></li>'),
      EXTENDED_DATA_ITEM_EL = $('<li><span class="value-span"></span></li>');

  var DOCUMENT,
      FOLDER_DICT,
      CURRENT_COORDS;

  var GeoInfoPre,
      FolderSelectContainer,
      FolderSelect,
      FolderContainer;

  // borrowed from http://stackoverflow.com/questions/27928/how-do-i-calculate-distance-between-two-latitude-longitude-points
  function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lon2-lon1);
    var a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c; // Distance in km
    return d;
  }
  function deg2rad(deg) {
    return deg * (Math.PI/180)
  }

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
    json.coords = polygonCenteriod(coords);

    return json;
  }

  function parsePoint(point) {
    var json = {},
        coordinatesText = point.find('>coordinates').text(),
        coords = JSON.parse('[' + coordinatesText + ']');

    json.coords = coords;

    return json;
  }

  function parsePlacemark(placemark) {
    var json = {},
        styleId = placemark.find('>styleUrl').text(),
        nameText = placemark.find('>name').text(),
        extendedData = placemark.find('>ExtendedData'),
        point = placemark.find('>Point'),
        polygon = placemark.find('>Polygon');

    json.styleId = styleId.substring(1);
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

  function parseStyle(style) {
    var json = {},
        id = style.attr('id'),
        iconStyle = style.find('>IconStyle');

    json.id = id;
    if (iconStyle.length > 0) {
      var href = iconStyle.find('>Icon>href').text();
      json.href = href;
    }

    return json;
  }

  function parseDocument(doc) {
    var json = {},
        name = doc.find('>name').text(),
        folders = doc.find('>Folder'),
        styles = doc.find('>Style');

    json.name = name;
    json.folderDict = {};
    json.styleDict = {};

    $.each(folders, function(i, folder) {
      var f = parseFolder($(folder));
      json.folderDict[f.name] = f;
    });

    $.each(styles, function(i, style) {
      var s = parseStyle($(style));
      json.styleDict[s.id] = s;
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

  function decoratePlacemark(placemark) {
    var currCroods = CURRENT_COORDS,
        coords = placemark.point.coords;

    var currLat = currCroods[1],
        currLon = currCroods[0],
        lat = coords[1],
        lon = coords[0];

    var dist = getDistanceFromLatLonInKm(currLat, currLon, lat, lon);
    placemark.geoDistance = dist;
  }

  function decorateFolder(folder) {
    var placemarks = folder.placemarks;

    $.each(placemarks, function(i, placemark) {
      decoratePlacemark(placemark);
    });

    placemarks.sort(function(p1, p2) {
      return p1.geoDistance - p2.geoDistance;
    });
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
      iconImg = $el.find('.placemark-icon'),
      nameEl = $el.find('.name'),
      distanceSpan = $el.find('.placemark-distance'),
      mapLinkAnchor = $el.find('.map-link');

    if (placemark.styleId && placemark.styleId.match(ICON_STYLE_ID_RE)) {
      var href = DOCUMENT.styleDict[placemark.styleId].href;
      if (href) {
        iconImg.attr('src', href);
      }
    }
    if (placemark.point) {
      mapLinkAnchor.attr('href', deriveGoogleMapsUrl(placemark.point.coords));
      mapLinkAnchor.text('(view in maps)');
    }
    if (placemark.geoDistance) {
      distanceSpan.text('[~' + placemark.geoDistance.toFixed(2) + ' km]');
    }
    if (placemark.data.Category && placemark.data.Category == CATEGORY_CONVENIENT_STORE) {
      placemarkList.append(renderExtendedDataItem('Location', placemark.data.Description));
    }

    nameEl.text(placemark.name);
    placemarkList.append(renderExtendedData(placemark.data));

    return $el;
  }

  function renderFolder(folder) {
    if (CURRENT_COORDS) {
      decorateFolder(folder);
    }

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
    renderCurrentFolder();
  }

  function renderCurrentFolder(doc) {
    if (!doc) {
      doc = DOCUMENT;
    }
    if (!doc || !FolderSelect || !FolderContainer) {
      return;
    }

    var selectedFolderName = FolderSelect.val(),
        folder = doc.folderDict[selectedFolderName];

    if (folder) {
      var folderEl = renderFolder(folder);
      FolderContainer.empty();
      FolderContainer.append(folderEl);
    }

  }

  function renderFolderSelect(folderDict) {
    var keys = [];
    for (var key in folderDict) {
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
    FolderSelect = renderFolderSelect(doc.folderDict);
    FolderSelect.on('change', handleFolderSelectChanged);
    FolderSelectContainer.append(FolderSelect);

    renderCurrentFolder(doc);
  }

  function initGeolocation() {
    if (!('geolocation' in navigator)) {
      return;
    }

    var options = {
      enableHighAccuracy: true,
      timeout: 3600,
      maximumAge: 600
    };

    navigator.geolocation.getCurrentPosition(function(pos) {
      var crd = pos.coords,
          coords = [
            crd.longitude,
            crd.latitude,
            0.0
          ];
      CURRENT_COORDS = coords;

      renderCurrentFolder();
    }, function(err) {
      GeoInfoPre.text('Cannot obtain current location');
      console.log('ERROR(' + err.code + '): ' + err.message);
    }, options);
  }

  function init() {
    GeoInfoPre = $('#geoinfo');
    FolderSelectContainer = $('#folder-select-container');
    FolderContainer = $('#content>.folder');

    initGeolocation();

    fetchKML().then(function(data) {
      DOCUMENT = parseKMLAsJson(data);
      renderDocument(DOCUMENT);

      $(document.body).removeClass('loading');
    });
  }

  $(document).ready(init);

})(jQuery);