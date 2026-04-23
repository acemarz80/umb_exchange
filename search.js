const courses = [

/* CS COURSES */
"CS105",
"CS107",
"CS109",
"CS110",
"CS114L",
"CS119",
"CS187SL",
"CS188SL",
"CS210",
"CS220",
"CS240",
"CS271L",
"CS285L",
"CS310",
"CS341",
"CS410",
"CS413",
"CS415",
"CS420",
"CS430",
"CS435",
"CS436",
"CS437",
"CS438",
"CS442",
"CS443",
"CS444",
"CS446",
"CS449",
"CS450",
"CS451",
"CS460",
"CS461",
"CS470",
"CS478",
"CS480",
"CS495",
"CS498",

/* IT COURSES */
"IT110",
"IT111L",
"IT114L",
"IT116",
"IT117",
"IT187SL",
"IT188SL",
"IT220",
"IT221",
"IT230L",
"IT240",
"IT244",
"IT246",
"IT285L",
"IT341",
"IT360",
"IT370",
"IT420",
"IT421",
"IT425L",
"IT428L",
"IT442",
"IT443",
"IT444",
"IT456",
"IT460",
"IT461L",
"IT471",
"IT472",
"IT478",
"IT480",
"IT485",
/* AF COURSES */

"AF210","AF211","AF301","AF310","AF311","AF315","AF317","AF325","AF330","AF335","AF363",
"AF405","AF426","AF427","AF435","AF443","AF444","AF445","AF450","AF451","AF455","AF470",
"AF475","AF478","AF480","AF488","AF490","AF495","AF498","AF499",

/* BIOCHEMISTRY COURSES */

"BIOCHM383","BIOCHM384","BIOCHM385","BIOCHM386",
"BIOCHM471","BIOCHM472","BIOCHM491","BIOCHM492",

/* Biology Courses */

"BIOL101","BIOL102","BIOL108","BIOL111","BIOL112","BIOL187S","BIOL188S",
"BIOL207","BIOL208","BIOL209","BIOL210","BIOL212","BIOL252","BIOL254","BIOL290",
"BIOL304","BIOL306","BIOL307","BIOL308","BIOL309","BIOL310","BIOL311","BIOL312",
"BIOL313","BIOL314","BIOL315","BIOL316","BIOL318","BIOL319","BIOL321","BIOL323",
"BIOL328","BIOL329","BIOL330","BIOL332","BIOL333","BIOL334","BIOL335","BIOL336L",
"BIOL337","BIOL338","BIOL339","BIOL340","BIOL342","BIOL343","BIOL344","BIOL345",
"BIOL347","BIOL348","BIOL352","BIOL353","BIOL354","BIOL355","BIOL356","BIOL357",
"BIOL358","BIOL360","BIOL361","BIOL362","BIOL363","BIOL364","BIOL365","BIOL366",
"BIOL370","BIOL372","BIOL376","BIOL377","BIOL378","BIOL380","BIOL381","BIOL382",
"BIOL390","BIOL395","BIOL444","BIOL478","BIOL479",

];

const searchInput = document.getElementById("courseSearch");
const suggestionsBox = document.getElementById("suggestions");


/* Live suggestions */
searchInput.addEventListener("input", function(){

    const value = searchInput.value.toUpperCase();
    suggestionsBox.innerHTML = "";

    if(value.length === 0) return;

    const matches = courses.filter(course =>
        course.includes(value)
    );

    matches.forEach(course => {

        const item = document.createElement("div");
        item.classList.add("suggestion-item");
        item.textContent = course;

        item.onclick = function(){
            window.location.href = "browse.html?course=" + course;
        };

        suggestionsBox.appendChild(item);

    });

});


/* Search button */
function searchCourse(){

    const value = searchInput.value.toUpperCase();

    if(value){
        window.location.href = "browse.html?course=" + value;
    }

}